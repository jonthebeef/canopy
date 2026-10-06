import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb, schema, type Db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { AuditChanges } from '@/lib/db/schema'
import type { Evidence, TreeNode, WorkspaceState } from '@/lib/ost'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Verifies the session user belongs to the workspace. Every workspace query goes through this. */
export async function requireMember(workspaceId: string) {
  const session = await getSession()
  if (!session?.user) throw new HttpError(401, 'Not signed in')
  const db = await getDb()
  const membership = await db.query.member.findFirst({
    where: and(
      eq(schema.member.workspaceId, workspaceId),
      eq(schema.member.userId, session.user.id),
    ),
  })
  if (!membership) throw new HttpError(404, 'Workspace not found')
  return { db, user: session.user, role: membership.role, membership }
}

export async function requireAdmin(workspaceId: string) {
  const ctx = await requireMember(workspaceId)
  if (ctx.role !== 'admin') throw new HttpError(403, 'Only workspace admins can do that')
  return ctx
}

export function toTreeNode(row: typeof schema.node.$inferSelect): TreeNode {
  return {
    ...row,
    archivedAt: row.archivedAt ? row.archivedAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export function toEvidence(row: typeof schema.evidence.$inferSelect): Evidence {
  const { workspaceId: _ws, ...rest } = row
  return {
    ...rest,
    archivedAt: row.archivedAt ? row.archivedAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export async function recordAudit(
  db: Db,
  event: {
    workspaceId: string
    nodeId?: string | null
    actorId: string
    action: (typeof schema.auditEvent.$inferInsert)['action']
    summary: string
    changes?: AuditChanges | null
    reason?: string | null
  },
) {
  await db.insert(schema.auditEvent).values({
    workspaceId: event.workspaceId,
    nodeId: event.nodeId ?? null,
    actorId: event.actorId,
    action: event.action,
    summary: event.summary,
    changes: event.changes ?? null,
    reason: event.reason ?? null,
  })
}

const PRESENCE_WRITE_INTERVAL_MS = 8_000

export async function loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
  const { db, user, role, membership } = await requireMember(workspaceId)

  const now = Date.now()
  if (!membership.lastSeenAt || now - membership.lastSeenAt.getTime() > PRESENCE_WRITE_INTERVAL_MS) {
    await db
      .update(schema.member)
      .set({ lastSeenAt: new Date(now) })
      .where(
        and(eq(schema.member.workspaceId, workspaceId), eq(schema.member.userId, user.id)),
      )
  }

  const [ws, members, nodes, evidence, latest] = await Promise.all([
    db.query.workspace.findFirst({ where: eq(schema.workspace.id, workspaceId) }),
    db
      .select({
        userId: schema.member.userId,
        role: schema.member.role,
        lastSeenAt: schema.member.lastSeenAt,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.workspaceId, workspaceId)),
    db.select().from(schema.node).where(eq(schema.node.workspaceId, workspaceId)),
    db.select().from(schema.evidence).where(eq(schema.evidence.workspaceId, workspaceId)),
    db
      .select({ id: schema.auditEvent.id })
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.workspaceId, workspaceId))
      .orderBy(desc(schema.auditEvent.id))
      .limit(1),
  ])
  if (!ws) throw new HttpError(404, 'Workspace not found')

  return {
    workspace: { id: ws.id, name: ws.name, product: ws.product, inviteCode: ws.inviteCode },
    me: { id: user.id, role },
    members: members.map((m) => ({
      ...m,
      lastSeenAt:
        m.userId === user.id ? now : m.lastSeenAt ? m.lastSeenAt.getTime() : null,
    })),
    nodes: nodes.map(toTreeNode),
    evidence: evidence.map(toEvidence),
    revision: latest[0]?.id ?? 0,
  }
}

export async function listMyWorkspaces(userId: string) {
  const db = await getDb()
  return db
    .select({
      id: schema.workspace.id,
      name: schema.workspace.name,
      product: schema.workspace.product,
      role: schema.member.role,
      nodeCount: sql<number>`(select count(*) from ${schema.node} where ${schema.node.workspaceId} = ${schema.workspace.id} and ${schema.node.archivedAt} is null)`,
      memberCount: sql<number>`(select count(*) from ${schema.member} m2 where m2.workspace_id = ${schema.workspace.id})`,
    })
    .from(schema.member)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.member.workspaceId))
    .where(eq(schema.member.userId, userId))
    .orderBy(desc(schema.member.joinedAt))
}

export function newInviteCode() {
  return nanoid(10)
}

export function newId() {
  return nanoid(12)
}
