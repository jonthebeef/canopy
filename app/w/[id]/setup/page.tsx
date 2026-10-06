import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { notFound } from 'next/navigation'
import { Brand } from '@/components/brand'
import { SetupClient } from '@/components/ost/setup-client'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { requireUser } from '@/lib/auth'
import { HttpError, loadWorkspaceState } from '@/lib/workspace'

export const metadata = { title: 'Setup — Canopy' }

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/w/${id}/setup`)
  let state
  try {
    state = await loadWorkspaceState(id)
  } catch (error) {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) notFound()
    throw error
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Brand href="/workspaces" />
          <div className="flex items-center gap-2">
            <Button size="sm" nativeButton={false} render={<Link href={`/w/${id}`} />}>
              Open tree
              <ArrowRight aria-hidden="true" />
            </Button>
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Workspace setup</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{state.workspace.name}</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Set the goal and the product outcomes the trio is working towards, then invite your designer and
            tech lead. Everyone can add opportunities, solutions and experiments in the tree.
          </p>
        </div>
        <SetupClient initial={state} />
      </main>
    </div>
  )
}
