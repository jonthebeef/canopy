import { Hono, type Context } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { z, ZodError } from 'zod'
import { getAuth, type AuthEnv } from '@/lib/auth'
import { getDb, schema } from '@/lib/db'
import { createEvidence, createEvidenceSchema, patchEvidence, patchEvidenceSchema } from '@/lib/evidence'
import { createNode, createNodeSchema, patchNode, patchNodeSchema } from '@/lib/nodes'
import {
  EVIDENCE_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  ancestry,
  isEffectivelyArchived,
  riceScore,
  type ActivityEvent,
  type EvidenceKind,
} from '@/lib/ost'
import {
  HttpError,
  auditInsert,
  listMyWorkspaces,
  loadWorkspaceState,
  newId,
  newInviteCode,
  requireAdmin,
  requireMember,
  toTreeNode,
  type RequestContext,
} from '@/lib/workspace'

type Bindings = AuthEnv
type AppContext = Context<{ Bindings: Bindings }>

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Strict-Transport-Security', 'max-age=63072000')
  c.header('X-Frame-Options', 'SAMEORIGIN')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
})

async function requestContext(c: AppContext): Promise<RequestContext> {
  const session = await getAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) throw new HttpError(401, 'Not signed in')
  return {
    db: getDb(c.env.DB),
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  }
}

async function handle<T>(c: AppContext, run: () => Promise<T>) {
  try {
    return c.json(await run())
  } catch (error) {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400)
    if (error instanceof ZodError) {
      return c.json({ error: error.issues[0]?.message ?? 'Invalid input' }, 400)
    }
    console.error('[api] unexpected error', error)
    return c.json({ error: 'Something went wrong' }, 500)
  }
}

app.all('/api/auth/*', (c) => getAuth(c.env, c.req.raw).handler(c.req.raw))

app.get('/api/workspaces', (c) =>
  handle(c, async () => {
    const context = await requestContext(c)
    return listMyWorkspaces(context.db, context.user.id)
  }),
)

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name').max(80),
  product: z.string().trim().max(120).default(''),
  goal: z.string().trim().min(1, 'Describe the business goal').max(200),
})

app.post('/api/workspaces', (c) =>
  handle(c, async () => {
    const context = await requestContext(c)
    const input = createWorkspaceSchema.parse(await c.req.json())
    const workspaceId = newId()
    const goalId = newId()
    await context.db.batch([
      context.db.insert(schema.workspace).values({
        id: workspaceId,
        name: input.name,
        product: input.product,
        inviteCode: newInviteCode(),
        createdBy: context.user.id,
      }),
      context.db.insert(schema.member).values({
        workspaceId,
        userId: context.user.id,
        role: 'admin',
      }),
      context.db.insert(schema.node).values({
        id: goalId,
        workspaceId,
        parentId: null,
        type: 'goal',
        title: input.goal,
        createdBy: context.user.id,
        updatedBy: context.user.id,
      }),
      auditInsert(context.db, {
        workspaceId,
        nodeId: goalId,
        actorId: context.user.id,
        action: 'workspace',
        summary: `Created workspace "${input.name}" with goal "${input.goal}"`,
      }),
    ])
    return { id: workspaceId }
  }),
)

app.post('/api/workspaces/join', (c) =>
  handle(c, async () => {
    const context = await requestContext(c)
    const { code: raw } = z.object({ code: z.string() }).parse(await c.req.json())
    const code = raw.trim().split('/').filter(Boolean).pop() ?? ''
    if (!code) throw new HttpError(400, 'Paste an invite code or link')
    const workspace = await context.db.query.workspace.findFirst({
      where: eq(schema.workspace.inviteCode, code),
    })
    if (!workspace) {
      throw new HttpError(404, "That invite code isn't valid. Ask your PM for a fresh link.")
    }
    const existing = await context.db.query.member.findFirst({
      where: and(
        eq(schema.member.workspaceId, workspace.id),
        eq(schema.member.userId, context.user.id),
      ),
    })
    if (!existing) {
      await context.db.batch([
        context.db.insert(schema.member).values({
          workspaceId: workspace.id,
          userId: context.user.id,
          role: 'member',
        }),
        auditInsert(context.db, {
          workspaceId: workspace.id,
          actorId: context.user.id,
          action: 'member',
          summary: 'Joined the workspace',
        }),
      ])
    }
    return { id: workspace.id }
  }),
)

app.get('/api/invites/:code', (c) =>
  handle(c, async () => {
    await requestContext(c)
    const workspace = await getDb(c.env.DB).query.workspace.findFirst({
      columns: { id: true, name: true },
      where: eq(schema.workspace.inviteCode, c.req.param('code')),
    })
    if (!workspace) throw new HttpError(404, 'Invite not found')
    return workspace
  }),
)

app.get('/api/w/:id/state', (c) =>
  handle(c, async () => loadWorkspaceState(c.req.param('id'), await requestContext(c))),
)

app.post('/api/w/:id/nodes', (c) =>
  handle(c, async () =>
    createNode(
      await requestContext(c),
      c.req.param('id'),
      createNodeSchema.parse(await c.req.json()),
    ),
  ),
)

app.patch('/api/w/:id/nodes/:nodeId', (c) =>
  handle(c, async () =>
    patchNode(
      await requestContext(c),
      c.req.param('id'),
      c.req.param('nodeId'),
      patchNodeSchema.parse(await c.req.json()),
    ),
  ),
)

app.post('/api/w/:id/evidence', (c) =>
  handle(c, async () =>
    createEvidence(
      await requestContext(c),
      c.req.param('id'),
      createEvidenceSchema.parse(await c.req.json()),
    ),
  ),
)

app.patch('/api/w/:id/evidence/:evidenceId', (c) =>
  handle(c, async () =>
    patchEvidence(
      await requestContext(c),
      c.req.param('id'),
      c.req.param('evidenceId'),
      patchEvidenceSchema.parse(await c.req.json()),
    ),
  ),
)

app.get('/api/w/:id/activity', (c) =>
  handle(c, async (): Promise<ActivityEvent[]> => {
    const id = c.req.param('id')
    const { db } = await requireMember(id, await requestContext(c))
    const nodeId = c.req.query('nodeId')
    const requested = Math.trunc(Number(c.req.query('limit')))
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 500) : 100
    const rows = await db
      .select({
        id: schema.auditEvent.id,
        nodeId: schema.auditEvent.nodeId,
        actorId: schema.auditEvent.actorId,
        actorName: schema.user.name,
        action: schema.auditEvent.action,
        summary: schema.auditEvent.summary,
        changes: schema.auditEvent.changes,
        reason: schema.auditEvent.reason,
        createdAt: schema.auditEvent.createdAt,
      })
      .from(schema.auditEvent)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditEvent.actorId))
      .where(
        nodeId
          ? and(eq(schema.auditEvent.workspaceId, id), eq(schema.auditEvent.nodeId, nodeId))
          : eq(schema.auditEvent.workspaceId, id),
      )
      .orderBy(desc(schema.auditEvent.id))
      .limit(limit)
    return rows.map((row) => ({
      ...row,
      actorName: row.actorName ?? 'Former member',
      createdAt: row.createdAt.getTime(),
    }))
  }),
)

const settingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  product: z.string().trim().max(120),
})

app.patch('/api/w/:id/settings', (c) =>
  handle(c, async () => {
    const id = c.req.param('id')
    const { db, user } = await requireAdmin(id, await requestContext(c))
    const input = settingsSchema.parse(await c.req.json())
    const current = await db.query.workspace.findFirst({ where: eq(schema.workspace.id, id) })
    if (!current) throw new HttpError(404, 'Workspace not found')
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (current.name !== input.name) changes.name = { from: current.name, to: input.name }
    if (current.product !== input.product) changes.product = { from: current.product, to: input.product }
    if (Object.keys(changes).length) {
      await db.batch([
        db.update(schema.workspace).set(input).where(eq(schema.workspace.id, id)),
        auditInsert(db, {
          workspaceId: id,
          actorId: user.id,
          action: 'workspace',
          summary: `Updated workspace ${Object.keys(changes).join(' and ')}`,
          changes,
        }),
      ])
    }
    return { ok: true }
  }),
)

app.post('/api/w/:id/invite/reset', (c) =>
  handle(c, async () => {
    const id = c.req.param('id')
    const { db, user } = await requireAdmin(id, await requestContext(c))
    await db.batch([
      db.update(schema.workspace).set({ inviteCode: newInviteCode() }).where(eq(schema.workspace.id, id)),
      auditInsert(db, {
        workspaceId: id,
        actorId: user.id,
        action: 'workspace',
        summary: 'Reset the invite link (old links no longer work)',
      }),
    ])
    return { ok: true }
  }),
)

app.patch('/api/w/:id/members/:userId', (c) =>
  handle(c, async () => {
    const id = c.req.param('id')
    const targetId = c.req.param('userId')
    const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(await c.req.json())
    const { db, user } = await requireAdmin(id, await requestContext(c))
    if (targetId === user.id) throw new HttpError(400, "You can't change your own role")
    const [target] = await db
      .select({ name: schema.user.name, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.workspaceId, id), eq(schema.member.userId, targetId)))
      .limit(1)
    if (!target) throw new HttpError(404, 'That person is not a member of this workspace')
    if (target.role !== role) {
      await db.batch([
        db.update(schema.member).set({ role }).where(
          and(eq(schema.member.workspaceId, id), eq(schema.member.userId, targetId)),
        ),
        auditInsert(db, {
          workspaceId: id,
          actorId: user.id,
          action: 'member',
          summary: `Made ${target.name} ${role === 'admin' ? 'an admin' : 'a contributor'}`,
        }),
      ])
    }
    return { ok: true }
  }),
)

function csvCell(value: unknown) {
  if (value == null) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

app.get('/api/w/:id/export', async (c) => {
  try {
    const id = c.req.param('id')
    const includeArchived = c.req.query('archived') === '1'
    const { db } = await requireMember(id, await requestContext(c))
    const [workspace, rows, evidenceRows, users] = await Promise.all([
      db.query.workspace.findFirst({ where: eq(schema.workspace.id, id) }),
      db.select().from(schema.node).where(eq(schema.node.workspaceId, id)),
      db.select().from(schema.evidence).where(eq(schema.evidence.workspaceId, id)),
      db.select({ id: schema.user.id, name: schema.user.name })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(eq(schema.member.workspaceId, id)),
    ])
    const nodes = rows.map(toTreeNode)
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const names = new Map(users.map((user) => [user.id, user.name]))
    const evidenceByNode = new Map<string, string[]>()
    for (const evidence of evidenceRows) {
      if (evidence.archivedAt) continue
      const kind = EVIDENCE_LABEL[evidence.kind as EvidenceKind] ?? evidence.kind
      const line = [`[${kind}]`, evidence.value, evidence.summary, evidence.source && `(${evidence.source})`]
        .filter(Boolean)
        .join(' ')
      evidenceByNode.set(evidence.nodeId, [...(evidenceByNode.get(evidence.nodeId) ?? []), line])
    }
    const header = [
      'ID', 'Type', 'Title', 'Path', 'Status', 'Reach', 'Impact', 'Confidence %', 'Effort',
      'RICE score', 'Description', 'Evidence count', 'Evidence', 'Created by', 'Created at',
      'Updated by', 'Updated at', 'Archived at', 'Archive reason',
    ]
    const lines = nodes
      .filter((node) => includeArchived || !isEffectivelyArchived(node.id, byId))
      .map((node) => {
        const score = riceScore(node)
        const evidence = evidenceByNode.get(node.id) ?? []
        return [
          node.id,
          TYPE_LABEL[node.type],
          node.title,
          ancestry(node.id, byId).map((ancestor) => ancestor.title).join(' › '),
          STATUS_LABEL[node.status],
          node.reach,
          node.impact,
          node.confidence,
          node.effort,
          score == null ? '' : score.toFixed(2),
          node.description,
          evidence.length,
          evidence.join('\n'),
          names.get(node.createdBy) ?? '',
          new Date(node.createdAt).toISOString(),
          names.get(node.updatedBy) ?? '',
          new Date(node.updatedAt).toISOString(),
          node.archivedAt ? new Date(node.archivedAt).toISOString() : '',
          node.archiveReason,
        ].map(csvCell).join(',')
      })
    const filename = `${(workspace?.name ?? 'tree').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ost.csv`
    return new Response([header.join(','), ...lines].join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400)
    console.error('[export] failed', error)
    return c.json({ error: 'Export failed' }, 500)
  }
})

app.notFound((c) => c.json({ error: 'API route not found' }, 404))

export default app
