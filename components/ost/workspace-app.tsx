'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Activity, GitBranch, Settings2, Table2 } from 'lucide-react'
import { Brand } from '@/components/brand'
import { UserMenu } from '@/components/user-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { initials, isOnline, type WorkspaceState } from '@/lib/ost'
import { cn } from '@/lib/utils'
import { ActivityList } from './activity-list'
import { AddNodeDialog } from './add-node-dialog'
import { ExportButton } from './export-button'
import { useWs, WorkspaceProvider } from './context'
import { NodePanel } from './node-panel'
import { TableView } from './table-view'
import { TreeView } from './tree-view'

type View = 'tree' | 'table' | 'activity'

const VIEWS: { id: View; label: string; icon: typeof GitBranch }[] = [
  { id: 'tree', label: 'Tree', icon: GitBranch },
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'activity', label: 'Activity', icon: Activity },
]

export function WorkspaceApp({
  initial,
  user,
}: {
  initial: WorkspaceState
  user: { name: string; email: string }
}) {
  return (
    <WorkspaceProvider initial={initial}>
      <Shell user={user} />
    </WorkspaceProvider>
  )
}

function Shell({ user }: { user: { name: string; email: string } }) {
  const { state, isAdmin, showArchived, setShowArchived, select, error } = useWs()
  const [view, setView] = useState<View>('tree')
  const archivedCount = state.nodes.filter((n) => n.archivedAt).length

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-col border-b bg-card">
        <div className="flex items-center gap-4 px-4 py-2.5">
          <Brand href="/workspaces" className="[&>span:last-child]:hidden md:[&>span:last-child]:inline" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-sm font-semibold">{state.workspace.name}</h1>
            {state.workspace.product && (
              <p className="truncate text-xs text-muted-foreground">{state.workspace.product}</p>
            )}
          </div>
          <Presence />
          {isAdmin && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/w/${state.workspace.id}/setup`} />}>
              <Settings2 aria-hidden="true" />
              <span className="hidden sm:inline">Setup</span>
            </Button>
          )}
          <UserMenu name={user.name} email={user.email} />
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 pb-2">
          <div role="tablist" aria-label="View" className="flex rounded-md bg-muted p-0.5">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  view === id && 'bg-card text-foreground shadow-xs',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {view !== 'activity' && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              Show archived
              {archivedCount > 0 && <span className="font-mono text-xs">({archivedCount})</span>}
            </label>
          )}

          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator offline={!!error} />
            <ExportButton workspaceId={state.workspace.id} includeArchived={showArchived} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" role="tabpanel" aria-label={`${view} view`}>
          {view === 'tree' && <TreeView />}
          {view === 'table' && <TableView />}
          {view === 'activity' && (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-2xl px-4 py-6">
                <h2 className="mb-2 text-lg font-semibold">Audit log</h2>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  Every addition, edit, move and archive across the tree, with who made it.
                </p>
                <ActivityList
                  workspaceId={state.workspace.id}
                  onSelectNode={(id) => {
                    select(id)
                    setView('tree')
                  }}
                />
              </div>
            </div>
          )}
        </main>
        <NodePanel />
      </div>
      <AddNodeDialog />
    </div>
  )
}

function Presence() {
  const { state } = useWs()
  const now = Date.now()
  const sorted = [...state.members].sort(
    (a, b) => Number(isOnline(b.lastSeenAt, now)) - Number(isOnline(a.lastSeenAt, now)),
  )
  return (
    <ul className="hidden items-center -space-x-1.5 sm:flex" aria-label="Team members">
      {sorted.map((m) => {
        const online = isOnline(m.lastSeenAt, now)
        return (
          <li key={m.userId}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="relative block rounded-full ring-2 ring-card"
                    aria-label={`${m.name}${online ? ' (online)' : ''}`}
                  />
                }
              >
                <Avatar className={cn('size-7', !online && 'opacity-50')}>
                  <AvatarFallback className="bg-secondary text-[10px] font-medium text-secondary-foreground">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                {online && (
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {m.name} · {m.role === 'admin' ? 'Admin' : 'Contributor'}
                {online ? ' · online' : ''}
              </TooltipContent>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}

function LiveIndicator({ offline }: { offline: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span
        className={cn('size-2 rounded-full', offline ? 'bg-destructive' : 'animate-pulse bg-primary')}
        aria-hidden="true"
      />
      {offline ? 'Reconnecting…' : 'Live'}
    </span>
  )
}
