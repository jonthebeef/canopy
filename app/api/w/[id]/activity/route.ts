import { and, desc, eq } from 'drizzle-orm'
import { handle } from '@/lib/api'
import { schema } from '@/lib/db'
import type { ActivityEvent } from '@/lib/ost'
import { requireMember } from '@/lib/workspace'

export async function GET(req: Request, ctx: RouteContext<'/api/w/[id]/activity'>) {
  const { id } = await ctx.params
  const url = new URL(req.url)
  const nodeId = url.searchParams.get('nodeId')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500)

  return handle(async (): Promise<ActivityEvent[]> => {
    const { db } = await requireMember(id)
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

    return rows.map((r) => ({
      ...r,
      actorName: r.actorName ?? 'Former member',
      createdAt: r.createdAt.getTime(),
    }))
  })
}
