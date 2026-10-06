'use client'

import { Archive, ArchiveRestore, GitBranch, Pencil, Plus, Settings2, UserPlus } from 'lucide-react'
import type { ActivityEvent } from '@/lib/ost'
import { useActivity } from '@/lib/use-workspace'
import { cn } from '@/lib/utils'

const ICON: Record<string, typeof Pencil> = {
  create: Plus,
  update: Pencil,
  move: GitBranch,
  archive: Archive,
  restore: ArchiveRestore,
  member: UserPlus,
  workspace: Settings2,
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
function relative(ts: number) {
  const diff = (ts - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(ts).toLocaleDateString()
}

function formatValue(v: unknown) {
  if (v == null || v === '') return '—'
  const s = String(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

export function ActivityList({
  workspaceId,
  nodeId,
  onSelectNode,
  dense,
}: {
  workspaceId: string
  nodeId?: string
  onSelectNode?: (id: string) => void
  dense?: boolean
}) {
  const { data, isLoading } = useActivity(workspaceId, nodeId)

  if (isLoading && !data) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (!data?.length) return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>

  return (
    <ol className="flex flex-col">
      {data.map((event) => (
        <ActivityItem key={event.id} event={event} dense={dense} onSelectNode={onSelectNode} />
      ))}
    </ol>
  )
}

function ActivityItem({
  event,
  dense,
  onSelectNode,
}: {
  event: ActivityEvent
  dense?: boolean
  onSelectNode?: (id: string) => void
}) {
  const Icon = ICON[event.action] ?? Pencil
  const changes = event.changes ? Object.entries(event.changes) : []
  const clickable = onSelectNode && event.nodeId

  return (
    <li className={cn('flex gap-3 border-b last:border-b-0', dense ? 'py-3' : 'py-4')}>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm leading-relaxed text-pretty">
          <span className="font-medium">{event.actorName}</span>{' '}
          {clickable ? (
            <button
              type="button"
              onClick={() => onSelectNode(event.nodeId!)}
              className="text-left underline-offset-2 hover:underline"
            >
              {lowerFirst(event.summary)}
            </button>
          ) : (
            lowerFirst(event.summary)
          )}
        </p>
        {changes.length > 0 && (
          <dl className="flex flex-col gap-1 rounded-md bg-muted px-2.5 py-2 font-mono text-xs">
            {changes.map(([field, { from, to }]) => (
              <div key={field} className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{field}</dt>
                <dd className="min-w-0 break-words">
                  <span className="text-muted-foreground line-through">{formatValue(from)}</span>
                  {' → '}
                  <span>{formatValue(to)}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {event.reason && (
          <p className="rounded-md border border-dashed px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
            Reason: {event.reason}
          </p>
        )}
        <time
          dateTime={new Date(event.createdAt).toISOString()}
          title={new Date(event.createdAt).toLocaleString()}
          className="text-xs text-muted-foreground"
        >
          {relative(event.createdAt)}
        </time>
      </div>
    </li>
  )
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
