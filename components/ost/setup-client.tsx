'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Archive, ArchiveRestore, Check, Copy, Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initials, type WorkspaceState } from '@/lib/ost'
import { cn } from '@/lib/utils'
import { useWs, WorkspaceProvider } from './context'
import { CommitText, NativeSelect, TypeTag } from './primitives'

export function SetupClient({ initial }: { initial: WorkspaceState }) {
  return (
    <WorkspaceProvider initial={initial}>
      <DetailsSection />
      <GoalSection />
      <InviteSection />
      <MembersSection />
    </WorkspaceProvider>
  )
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function DetailsSection() {
  const { state, isAdmin, mutate } = useWs()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const response = await fetch(`/api/w/${state.workspace.id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), product: form.get('product') ?? '' }),
    })
    const result = await response.json() as { error?: string }
    setPending(false)
    if (!response.ok) return setError(result.error ?? 'Could not save workspace')
    await mutate()
    toast.success('Saved')
  }

  return (
    <Section id="details" title="Team & product">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ws-name">Team / workspace name</Label>
            <Input id="ws-name" name="name" required maxLength={80} defaultValue={state.workspace.name} disabled={!isAdmin} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ws-product">Product</Label>
            <Input
              id="ws-product"
              name="product"
              maxLength={120}
              defaultValue={state.workspace.product}
              placeholder="e.g. Checkout app"
              disabled={!isAdmin}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {isAdmin && (
          <Button type="submit" size="sm" disabled={pending} className="self-start">
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save details
          </Button>
        )}
      </form>
    </Section>
  )
}

function GoalSection() {
  const { state, isAdmin, patchNode, createNode } = useWs()
  const [showArchived, setShowArchived] = useState(false)
  const goal = state.nodes.find((n) => n.type === 'goal' && !n.parentId)
  const outcomes = state.nodes
    .filter((n) => n.type === 'outcome' && n.parentId === goal?.id)
    .filter((n) => showArchived || !n.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  const archivedCount = state.nodes.filter((n) => n.type === 'outcome' && n.archivedAt).length
  const [adding, setAdding] = useState(false)

  if (!goal) return null

  return (
    <Section
      id="goal"
      title="Goal & product outcomes"
      description="The goal is the business outcome at the root of the tree. Product outcomes are the measurable behaviour changes the trio can influence."
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TypeTag type="goal" />
          <span className="text-xs text-muted-foreground">Root of the tree</span>
        </div>
        <CommitText
          aria-label="Goal"
          value={goal.title}
          disabled={!isAdmin}
          onCommit={(title) => title.trim() && patchNode(goal.id, { op: 'update', fields: { title: title.trim() } })}
          className="-mx-2 text-base font-medium"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <TypeTag type="outcome" />
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
            </button>
          )}
        </div>
        {outcomes.length === 0 && (
          <p className="text-sm text-muted-foreground">No outcomes yet. Add the first one below.</p>
        )}
        <ul className="flex flex-col divide-y rounded-lg border">
          {outcomes.map((o) => (
            <li key={o.id} className={cn('flex items-center gap-2 px-2 py-1.5', o.archivedAt && 'bg-muted')}>
              <CommitText
                aria-label="Outcome"
                value={o.title}
                disabled={!isAdmin || !!o.archivedAt}
                onCommit={(title) => title.trim() && patchNode(o.id, { op: 'update', fields: { title: title.trim() } })}
                className={cn('text-sm', o.archivedAt && 'text-muted-foreground line-through')}
              />
              {isAdmin &&
                (o.archivedAt ? (
                  <Button variant="ghost" size="icon-sm" aria-label={`Restore ${o.title}`} onClick={() => patchNode(o.id, { op: 'restore' })}>
                    <ArchiveRestore aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Archive ${o.title}`}
                    onClick={async () => {
                      const ok = await patchNode(o.id, { op: 'archive', reason: 'Archived from setup' })
                      if (ok) toast('Outcome archived', { description: 'Restore it any time from setup or the tree.' })
                    }}
                  >
                    <Archive aria-hidden="true" />
                  </Button>
                ))}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const title = String(new FormData(form).get('title') ?? '').trim()
              if (!title) return
              setAdding(true)
              const created = await createNode({ parentId: goal.id, type: 'outcome', title })
              setAdding(false)
              if (created) form.reset()
            }}
          >
            <Label htmlFor="new-outcome" className="sr-only">
              New product outcome
            </Label>
            <Input id="new-outcome" name="title" maxLength={200} required placeholder="e.g. Increase repeat purchases within 30 days" />
            <Button type="submit" variant="outline" disabled={adding}>
              {adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Add
            </Button>
          </form>
        )}
      </div>
    </Section>
  )
}

const noopSubscribe = () => () => {}

function InviteSection() {
  const { state, isAdmin, mutate } = useWs()
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '')
  const link = `${origin}/join/${state.workspace.inviteCode}`
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!isAdmin || !state.workspace.inviteCode) {
    return (
      <Section
        id="invite"
        title="Invite your trio"
        description="Only admins can share the invite link. Ask your PM to send it to new teammates."
      >
        {null}
      </Section>
    )
  }

  return (
    <Section
      id="invite"
      title="Invite your trio"
      description="Share this link with your designer and tech lead. They'll create their own account and join as contributors."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={link} aria-label="Invite link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const response = await fetch(`/api/w/${state.workspace.id}/invite/reset`, { method: 'POST' })
                  const result = await response.json() as { error?: string }
                  if (!response.ok) {
                    toast.error(result.error ?? 'Could not reset invite link')
                    return
                  }
                  await mutate()
                  toast.success('New invite link created', { description: 'The old link no longer works.' })
                })
              }
            >
              <RefreshCw className={cn(pending && 'animate-spin')} aria-hidden="true" />
              Reset
            </Button>
          )}
        </div>
      </div>
    </Section>
  )
}

function MembersSection() {
  const { state, isAdmin, mutate } = useWs()
  const [pending, startTransition] = useTransition()

  return (
    <Section
      id="members"
      title="Members"
      description="Admins can edit the goal and outcomes and manage the workspace. Contributors can build out everything beneath the outcomes."
    >
      <ul className="flex flex-col divide-y">
        {state.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
              {initials(m.name)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {m.name}
                {m.userId === state.me.id && <span className="font-normal text-muted-foreground"> (you)</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">{m.email}</span>
            </div>
            {isAdmin && m.userId !== state.me.id ? (
              <NativeSelect
                aria-label={`Role for ${m.name}`}
                value={m.role}
                disabled={pending}
                className="w-36"
                onChange={(e) => {
                  const role = e.target.value as 'admin' | 'member'
                  startTransition(async () => {
                    try {
                      const response = await fetch(`/api/w/${state.workspace.id}/members/${m.userId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role }),
                      })
                      const result = await response.json() as { error?: string }
                      if (!response.ok) {
                        toast.error(result.error ?? 'Could not change role')
                        return
                      }
                      await mutate()
                      toast.success(`${m.name} is now ${role === 'admin' ? 'an admin' : 'a contributor'}`)
                    } catch {
                      toast.error('Could not change role')
                    }
                  })
                }}
              >
                <option value="admin">Admin</option>
                <option value="member">Contributor</option>
              </NativeSelect>
            ) : (
              <span className="text-xs text-muted-foreground">{m.role === 'admin' ? 'Admin' : 'Contributor'}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
