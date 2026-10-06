import 'server-only'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@/lib/db'
import type { AuditChanges } from '@/lib/db/schema'
import {
  ALLOWED_CHILDREN,
  EFFORT_MIN,
  NODE_STATUSES,
  RICE_MAX,
  NODE_TYPES,
  STATUS_LABEL,
  TYPE_LABEL,
  type NodeType,
} from '@/lib/ost'
import { HttpError, auditInsert, newId, requireMember, toTreeNode } from '@/lib/workspace'

const ADMIN_ONLY_TYPES: NodeType[] = ['goal', 'outcome']

const outOfTen = z.number().min(0, 'Use 0–10').max(RICE_MAX, 'Use 0–10').nullable()

const editableFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(5000),
  status: z.enum(NODE_STATUSES),
  reach: outOfTen,
  impact: outOfTen,
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .refine((v) => v % 10 === 0, 'Confidence goes in 10% steps')
    .nullable(),
  effort: z.number().min(EFFORT_MIN, 'Effort must be at least 0.1').max(RICE_MAX, 'Use 0.1–10').nullable(),
}

export const createNodeSchema = z.object({
  parentId: z.string().min(1),
  type: z.enum(NODE_TYPES),
  title: editableFields.title,
  description: editableFields.description.optional(),
})

export const patchNodeSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('update'),
    fields: z.object(editableFields).partial(),
    // The values the client last saw for the fields it is changing. If the stored
    // value differs, someone else edited it in the meantime and we refuse to overwrite.
    expected: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  }),
  z.object({ op: z.literal('move'), parentId: z.string().min(1) }),
  z.object({ op: z.literal('archive'), reason: z.string().trim().max(500).optional() }),
  z.object({ op: z.literal('restore') }),
])

type FieldName = keyof typeof editableFields

function assertCanEdit(role: 'admin' | 'member', type: NodeType) {
  if (role !== 'admin' && ADMIN_ONLY_TYPES.includes(type)) {
    throw new HttpError(403, `Only the workspace admin can change the ${TYPE_LABEL[type].toLowerCase()}`)
  }
}

async function getNodeInWorkspace(
  db: Awaited<ReturnType<typeof requireMember>>['db'],
  workspaceId: string,
  nodeId: string,
) {
  const row = await db.query.node.findFirst({
    where: and(eq(schema.node.id, nodeId), eq(schema.node.workspaceId, workspaceId)),
  })
  if (!row) throw new HttpError(404, 'Item not found')
  return row
}

export async function createNode(workspaceId: string, input: z.infer<typeof createNodeSchema>) {
  const { db, user, role } = await requireMember(workspaceId)
  assertCanEdit(role, input.type)

  const parent = await getNodeInWorkspace(db, workspaceId, input.parentId)
  if (!ALLOWED_CHILDREN[parent.type].includes(input.type)) {
    throw new HttpError(
      400,
      `A ${TYPE_LABEL[input.type].toLowerCase()} can't sit under a ${TYPE_LABEL[parent.type].toLowerCase()}`,
    )
  }

  const id = newId()
  const [[row]] = await db.batch([
    db
      .insert(schema.node)
      .values({
        id,
        workspaceId,
        parentId: parent.id,
        type: input.type,
        title: input.title,
        description: input.description ?? '',
        sortOrder: Date.now(),
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning(),
    auditInsert(db, {
      workspaceId,
      nodeId: id,
      actorId: user.id,
      action: 'create',
      summary: `Added ${TYPE_LABEL[input.type].toLowerCase()} "${input.title}" under "${parent.title}"`,
    }),
  ])
  return toTreeNode(row)
}

export async function patchNode(
  workspaceId: string,
  nodeId: string,
  input: z.infer<typeof patchNodeSchema>,
) {
  const { db, user, role } = await requireMember(workspaceId)
  const current = await getNodeInWorkspace(db, workspaceId, nodeId)
  assertCanEdit(role, current.type)

  if (input.op === 'update') {
    const changes: AuditChanges = {}
    const set: Partial<typeof schema.node.$inferInsert> = {}
    for (const [key, value] of Object.entries(input.fields) as [FieldName, unknown][]) {
      if (value === undefined) continue
      if (current[key] === value) continue
      if (input.expected && key in input.expected && input.expected[key] !== current[key]) {
        throw new HttpError(
          409,
          `Someone else changed the ${key} on "${current.title}" while you were editing. Showing their version — re-apply your change if it still applies.`,
        )
      }
      changes[key] = { from: current[key], to: value }
      ;(set as Record<string, unknown>)[key] = value
    }
    if (Object.keys(set).length === 0) return toTreeNode(current)

    const keys = Object.keys(changes) as FieldName[]
    const title = (set.title as string | undefined) ?? current.title
    const summary =
      keys.length === 1 && keys[0] === 'status'
        ? `Set "${title}" to ${STATUS_LABEL[set.status!]}`
        : `Changed ${keys.join(', ')} on "${title}"`

    const [[row]] = await db.batch([
      db
        .update(schema.node)
        .set({ ...set, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(schema.node.id, nodeId))
        .returning(),
      auditInsert(db, { workspaceId, nodeId, actorId: user.id, action: 'update', summary, changes }),
    ])
    return toTreeNode(row)
  }

  if (input.op === 'move') {
    if (current.type === 'goal') throw new HttpError(400, 'The goal is the root of the tree')
    if (input.parentId === nodeId) throw new HttpError(400, "An item can't be its own parent")
    const target = await getNodeInWorkspace(db, workspaceId, input.parentId)
    if (!ALLOWED_CHILDREN[target.type].includes(current.type)) {
      throw new HttpError(
        400,
        `A ${TYPE_LABEL[current.type].toLowerCase()} can't sit under a ${TYPE_LABEL[target.type].toLowerCase()}`,
      )
    }
    // Reject moves that would put a node underneath its own descendant.
    const all = await db
      .select({ id: schema.node.id, parentId: schema.node.parentId, title: schema.node.title })
      .from(schema.node)
      .where(eq(schema.node.workspaceId, workspaceId))
    const byId = new Map(all.map((n) => [n.id, n]))
    let cursor: string | null | undefined = target.id
    while (cursor) {
      if (cursor === nodeId) throw new HttpError(400, "Can't move an item underneath itself")
      cursor = byId.get(cursor)?.parentId
    }
    const fromTitle = current.parentId ? (byId.get(current.parentId)?.title ?? null) : null

    const [[row]] = await db.batch([
      db
        .update(schema.node)
        .set({ parentId: target.id, sortOrder: Date.now(), updatedBy: user.id, updatedAt: new Date() })
        .where(eq(schema.node.id, nodeId))
        .returning(),
      auditInsert(db, {
        workspaceId,
        nodeId,
        actorId: user.id,
        action: 'move',
        summary: `Moved "${current.title}" from "${fromTitle ?? '—'}" to "${target.title}"`,
        changes: { parent: { from: fromTitle, to: target.title } },
      }),
    ])
    return toTreeNode(row)
  }

  if (input.op === 'archive') {
    if (current.type === 'goal') throw new HttpError(400, "The goal can't be archived")
    if (current.archivedAt) return toTreeNode(current)
    const reason = input.reason || null
    const [[row]] = await db.batch([
      db
        .update(schema.node)
        .set({ archivedAt: new Date(), archivedBy: user.id, archiveReason: reason })
        .where(eq(schema.node.id, nodeId))
        .returning(),
      auditInsert(db, {
        workspaceId,
        nodeId,
        actorId: user.id,
        action: 'archive',
        summary: `Archived ${TYPE_LABEL[current.type].toLowerCase()} "${current.title}"`,
        reason,
      }),
    ])
    return toTreeNode(row)
  }

  if (!current.archivedAt) return toTreeNode(current)
  const [[row]] = await db.batch([
    db
      .update(schema.node)
      .set({ archivedAt: null, archivedBy: null, archiveReason: null, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(schema.node.id, nodeId))
      .returning(),
    auditInsert(db, {
      workspaceId,
      nodeId,
      actorId: user.id,
      action: 'restore',
      summary: `Restored ${TYPE_LABEL[current.type].toLowerCase()} "${current.title}"`,
      changes: current.archiveReason ? { archiveReason: { from: current.archiveReason, to: null } } : null,
    }),
  ])
  return toTreeNode(row)
}
