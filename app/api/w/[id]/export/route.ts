import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { schema } from '@/lib/db'
import { STATUS_LABEL, TYPE_LABEL, ancestry, riceScore } from '@/lib/ost'
import { HttpError, requireMember, toTreeNode } from '@/lib/workspace'

function csvCell(value: unknown) {
  if (value == null) return ''
  let s = String(value)
  // Prevent spreadsheet formula injection from user-entered text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request, ctx: RouteContext<'/api/w/[id]/export'>) {
  const { id } = await ctx.params
  const includeArchived = new URL(req.url).searchParams.get('archived') === '1'
  try {
    const { db } = await requireMember(id)
    const [ws, rows, users] = await Promise.all([
      db.query.workspace.findFirst({ where: eq(schema.workspace.id, id) }),
      db.select().from(schema.node).where(eq(schema.node.workspaceId, id)),
      db
        .select({ id: schema.user.id, name: schema.user.name })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(eq(schema.member.workspaceId, id)),
    ])
    const nodes = rows.map(toTreeNode)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const names = new Map(users.map((u) => [u.id, u.name]))

    const header = [
      'ID', 'Type', 'Title', 'Path', 'Status', 'Reach', 'Impact', 'Confidence %', 'Effort',
      'RICE score', 'Description', 'Created by', 'Created at', 'Updated by', 'Updated at',
      'Archived at', 'Archive reason',
    ]
    const lines = nodes
      .filter((n) => includeArchived || !n.archivedAt)
      .map((n) => {
        const path = ancestry(n.id, byId).map((a) => a.title).join(' › ')
        const score = riceScore(n)
        return [
          n.id, TYPE_LABEL[n.type], n.title, path, STATUS_LABEL[n.status], n.reach, n.impact,
          n.confidence, n.effort, score == null ? '' : score.toFixed(2), n.description,
          names.get(n.createdBy) ?? '', new Date(n.createdAt).toISOString(),
          names.get(n.updatedBy) ?? '', new Date(n.updatedAt).toISOString(),
          n.archivedAt ? new Date(n.archivedAt).toISOString() : '', n.archiveReason,
        ].map(csvCell).join(',')
      })

    const filename = `${(ws?.name ?? 'tree').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ost.csv`
    return new NextResponse([header.join(','), ...lines].join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[export] failed', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
