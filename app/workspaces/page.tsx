import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Brand } from '@/components/brand'
import { Badge } from '@/components/ui/badge'
import { UserMenu } from '@/components/user-menu'
import { CreateWorkspaceForm, JoinWorkspaceForm } from '@/components/workspace-forms'
import { requireUser } from '@/lib/auth'
import { listMyWorkspaces } from '@/lib/workspace'

export const metadata = { title: 'Workspaces — Canopy' }

export default async function WorkspacesPage() {
  const user = await requireUser('/workspaces')
  const workspaces = await listMyWorkspaces(user.id)

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Brand href="/workspaces" />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">
        <section className="flex flex-col gap-4" aria-labelledby="your-workspaces">
          <h1 id="your-workspaces" className="text-2xl font-semibold tracking-tight">
            Your workspaces
          </h1>
          {workspaces.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {"You're not in any workspaces yet. Create one below, or join with the invite link your PM shared."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {workspaces.map((ws) => (
                <li key={ws.id}>
                  <Link
                    href={`/w/${ws.id}`}
                    className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{ws.name}</span>
                        {ws.product && (
                          <span className="text-sm text-muted-foreground">{ws.product}</span>
                        )}
                      </div>
                      <Badge variant={ws.role === 'admin' ? 'default' : 'secondary'}>
                        {ws.role === 'admin' ? 'Admin' : 'Contributor'}
                      </Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
                      <span className="font-mono text-xs">
                        {ws.nodeCount} nodes · {ws.memberCount} {ws.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-6" aria-labelledby="create-ws">
            <div className="flex flex-col gap-1">
              <h2 id="create-ws" className="font-semibold">
                Start a new tree
              </h2>
              <p className="text-sm text-muted-foreground">Usually done by the product manager.</p>
            </div>
            <CreateWorkspaceForm />
          </section>
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-6" aria-labelledby="join-ws">
            <div className="flex flex-col gap-1">
              <h2 id="join-ws" className="font-semibold">
                Join your trio
              </h2>
              <p className="text-sm text-muted-foreground">Paste the invite link from your PM.</p>
            </div>
            <JoinWorkspaceForm />
          </section>
        </div>
      </main>
    </div>
  )
}
