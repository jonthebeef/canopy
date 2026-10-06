import 'server-only'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@/lib/db'
import type { AuditChanges } from '@/lib/db/schema'
import { EVIDENCE_KINDS, EVIDENCE_LABEL } from '@/lib/ost'
import { HttpError, newId, recordAudit, requireMember, toEvidence } from '@/lib/workspace'

const evidenceFields = {
  kind: z.enum(EVIDENCE_KINDS),
  summary: z.string().trim().min(1, 'Add a short summary').max(300),
  value: z.string().trim().max(60),
  detail: z.string().trim().max(3000),
  source: z.string().trim().max(500),
}

export const createEvidenceSchema = z.object({
  nodeId: z.string().min(1),
  kind: evidenceFields.kind,
  summary: evidenceFields.summary,
  value: evidenceFields.value.optional(),
  detail: evidenceFields.detail.optional(),
  source: evidenceFields.source.optional(),
})

export const patchEvidenceSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), fields: z.object(evidenceFields).partial() }),
  z.object({ op: z.literal('archive') }),
  z.object({ op: z.literal('restore') }),
])

type FieldName = keyof typeof evidenceFields

const label = (kind: (typeof EVIDENCE_KINDS)[number]) => EVIDENCE_LABEL[kind].toLowerCase()

export async function createEvidence(workspaceId: string, input: z.infer<typeof createEvidenceSchema>) {
  const { db, user } = await requireMember(workspaceId)
  const parent = await db.query.node.findFirst({
    where: and(eq(schema.node.id, input.nodeId), eq(schema.node.workspaceId, workspaceId)),
  })
  if (!parent) throw new HttpError(404, 'Item not found')

  const [row] = await db
    .insert(schema.evidence)
    .values({
      id: newId(),
      workspaceId,
      nodeId: parent.id,
      kind: input.kind,
      summary: input.summary,
      value: input.value ?? '',
      detail: input.detail ?? '',
      source: input.source ?? '',
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning()

  await recordAudit(db, {
    workspaceId,
    nodeId: parent.id,
    actorId: user.id,
    action: 'create',
    summary: `Added ${label(row.kind)} "${row.summary}" to "${parent.title}"`,
  })
  return toEvidence(row)
}

export async function patchEvidence(
  workspaceId: string,
  evidenceId: string,
  input: z.infer<typeof patchEvidenceSchema>,
) {
  const { db, user } = await requireMember(workspaceId)
  const current = await db.query.evidence.findFirst({
    where: and(eq(schema.evidence.id, evidenceId), eq(schema.evidence.workspaceId, workspaceId)),
  })
  if (!current) throw new HttpError(404, 'Evidence not found')

  if (input.op === 'update') {
    const changes: AuditChanges = {}
    const set: Partial<typeof schema.evidence.$inferInsert> = {}
    for (const [key, value] of Object.entries(input.fields) as [FieldName, string | undefined][]) {
      if (value === undefined || current[key] === value) continue
      changes[`evidence.${key}`] = { from: current[key], to: value }
      ;(set as Record<string, unknown>)[key] = value
    }
    if (Object.keys(set).length === 0) return toEvidence(current)
    const [row] = await db
      .update(schema.evidence)
      .set({ ...set, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(schema.evidence.id, evidenceId))
      .returning()
    await recordAudit(db, {
      workspaceId,
      nodeId: current.nodeId,
      actorId: user.id,
      action: 'update',
      summary: `Edited ${label(row.kind)} "${row.summary}"`,
      changes,
    })
    return toEvidence(row)
  }

  const archiving = input.op === 'archive'
  if (archiving === Boolean(current.archivedAt)) return toEvidence(current)
  const [row] = await db
    .update(schema.evidence)
    .set(
      archiving
        ? { archivedAt: new Date(), archivedBy: user.id }
        : { archivedAt: null, archivedBy: null, updatedBy: user.id, updatedAt: new Date() },
    )
    .where(eq(schema.evidence.id, evidenceId))
    .returning()
  await recordAudit(db, {
    workspaceId,
    nodeId: current.nodeId,
    actorId: user.id,
    action: archiving ? 'archive' : 'restore',
    summary: `${archiving ? 'Archived' : 'Restored'} ${label(row.kind)} "${row.summary}"`,
  })
  return toEvidence(row)
}
