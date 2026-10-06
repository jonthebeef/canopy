import { lazy, Suspense, useEffect } from 'react'
import useSWR from 'swr'
import { Archive, ArrowRight, GitBranch, Table2, Users } from 'lucide-react'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { Brand } from '@/components/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { CreateWorkspaceForm, JoinWorkspaceForm } from '@/components/workspace-forms'
import { useSession } from '@/lib/auth-client'
import type { WorkspaceState } from '@/lib/ost'

const FEATURES = [
  { icon: GitBranch, title: 'One tree, two views', body: 'Map outcomes, opportunities, solutions and experiments on a canvas, or edit the same records in a sortable table.' },
  { icon: Table2, title: 'RICE on anything', body: 'Optionally score any node. Scores compute automatically and export straight to CSV for your spreadsheet.' },
  { icon: Users, title: 'Built for the trio', body: 'PM, designer and engineer each sign in. Edits sync live and every change carries a name.' },
  { icon: Archive, title: 'Nothing silently disappears', body: 'Removing an idea archives it with a reason. The full history is audited and anything can be restored.' },
]

const WorkspaceApp = lazy(() =>
  import('@/components/ost/workspace-app').then((module) => ({ default: module.WorkspaceApp })),
)
const SetupClient = lazy(() =>
  import('@/components/ost/setup-client').then((module) => ({ default: module.SetupClient })),
)

type WorkspaceSummary = {
  id: string
  name: string
  product: string
  role: 'admin' | 'member'
  nodeCount: number
  memberCount: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (response.status === 401) {
    window.location.replace(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
    throw new Error('Not signed in')
  }
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? 'Could not load this page')
  return result
}

function useTitle(title: string) {
  useEffect(() => { document.title = title }, [title])
}

function LoadingPage() {
  return <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading…</main>
}

function ErrorPage({ message = 'We could not find that page.' }: { message?: string }) {
  return (
    <AuthShell title="Page not found" subtitle={message}>
      <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/workspaces">Back to workspaces</a>
    </AuthShell>
  )
}

function HomePage() {
  useTitle('Canopy — Opportunity Solution Trees for product trios')
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<a href="/sign-in" />}>Sign in</Button>
          <Button nativeButton={false} render={<a href="/sign-up" />}>Get started</Button>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-16 pb-20 md:pt-24">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Opportunity Solution Trees</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">Your discovery work, structured instead of stickied.</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">Canopy gives your product trio a shared, auditable opportunity solution tree. Build it visually, score it in a table, and never lose track of why an idea was dropped.</p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" nativeButton={false} render={<a href="/sign-up" />}>Create a workspace</Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<a href="/sign-in" />}>I have an invite</Button>
          </div>
        </section>
        <section className="canvas-grid border-y">
          <ul className="mx-auto grid w-full max-w-6xl gap-px px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-3 rounded-lg border bg-card p-6">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-sm text-muted-foreground">Runs on Cloudflare Workers + D1.</footer>
    </div>
  )
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  useTitle(`${mode === 'sign-in' ? 'Sign in' : 'Create account'} — Canopy`)
  const next = new URLSearchParams(location.search).get('next') ?? undefined
  return (
    <AuthShell
      title={mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'sign-in' ? 'Sign in to continue to your opportunity solution trees.' : 'Join your product trio or start a new opportunity solution tree.'}
    >
      <AuthForm mode={mode} next={next} />
    </AuthShell>
  )
}

function WorkspacesPage() {
  useTitle('Workspaces — Canopy')
  const session = useSession()
  const { data: workspaces, error } = useSWR<WorkspaceSummary[]>(session.data?.user ? '/api/workspaces' : null, fetchJson)
  if (session.isPending) return <LoadingPage />
  if (!session.data?.user) {
    window.location.replace('/sign-in?next=/workspaces')
    return <LoadingPage />
  }
  if (!workspaces) return error ? <ErrorPage message={error.message} /> : <LoadingPage />
  const user = session.data.user
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
          <h1 id="your-workspaces" className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
          {workspaces.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">You&apos;re not in any workspaces yet. Create one below, or join with the invite link your PM shared.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <a href={`/w/${workspace.id}`} className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1"><span className="font-semibold">{workspace.name}</span>{workspace.product && <span className="text-sm text-muted-foreground">{workspace.product}</span>}</div>
                      <Badge variant={workspace.role === 'admin' ? 'default' : 'secondary'}>{workspace.role === 'admin' ? 'Admin' : 'Contributor'}</Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
                      <span className="font-mono text-xs">{workspace.nodeCount} nodes · {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}</span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-6" aria-labelledby="create-ws">
            <div className="flex flex-col gap-1"><h2 id="create-ws" className="font-semibold">Start a new tree</h2><p className="text-sm text-muted-foreground">Usually done by the product manager.</p></div>
            <CreateWorkspaceForm />
          </section>
          <section className="flex flex-col gap-4 rounded-lg border bg-card p-6" aria-labelledby="join-ws">
            <div className="flex flex-col gap-1"><h2 id="join-ws" className="font-semibold">Join your trio</h2><p className="text-sm text-muted-foreground">Paste the invite link from your PM.</p></div>
            <JoinWorkspaceForm />
          </section>
        </div>
      </main>
    </div>
  )
}

function JoinPage({ code }: { code: string }) {
  useTitle('Join workspace — Canopy')
  const session = useSession()
  const { data: workspace, error } = useSWR<{ id: string; name: string }>(session.data?.user ? `/api/invites/${encodeURIComponent(code)}` : null, fetchJson)
  if (session.isPending) return <LoadingPage />
  if (!session.data?.user) {
    window.location.replace(`/sign-in?next=${encodeURIComponent(`/join/${code}`)}`)
    return <LoadingPage />
  }
  return (
    <AuthShell
      title={workspace ? `Join ${workspace.name}` : error ? 'Invite not found' : 'Loading invite…'}
      subtitle={workspace ? "You've been invited to collaborate on this opportunity solution tree." : error ? 'This invite link has expired or been reset. Ask your PM for a new one.' : 'Checking this invitation.'}
    >
      {workspace ? <JoinWorkspaceForm defaultCode={code} /> : error ? <JoinWorkspaceForm /> : <p className="text-sm text-muted-foreground">Loading…</p>}
    </AuthShell>
  )
}

function WorkspacePage({ id }: { id: string }) {
  useTitle('Tree — Canopy')
  const session = useSession()
  const { data: state, error } = useSWR<WorkspaceState>(session.data?.user ? `/api/w/${id}/state` : null, fetchJson)
  if (session.isPending) return <LoadingPage />
  if (!session.data?.user) {
    window.location.replace(`/sign-in?next=${encodeURIComponent(`/w/${id}`)}`)
    return <LoadingPage />
  }
  if (!state) return error ? <ErrorPage message={error.message} /> : <LoadingPage />
  return (
    <Suspense fallback={<LoadingPage />}>
      <WorkspaceApp initial={state} user={{ name: session.data.user.name, email: session.data.user.email }} />
    </Suspense>
  )
}

function SetupPage({ id }: { id: string }) {
  useTitle('Setup — Canopy')
  const session = useSession()
  const { data: state, error } = useSWR<WorkspaceState>(session.data?.user ? `/api/w/${id}/state` : null, fetchJson)
  if (session.isPending) return <LoadingPage />
  if (!session.data?.user) {
    window.location.replace(`/sign-in?next=${encodeURIComponent(`/w/${id}/setup`)}`)
    return <LoadingPage />
  }
  if (!state) return error ? <ErrorPage message={error.message} /> : <LoadingPage />
  const user = session.data.user
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Brand href="/workspaces" />
          <div className="flex items-center gap-2">
            <Button size="sm" nativeButton={false} render={<a href={`/w/${id}`} />}>Open tree<ArrowRight aria-hidden="true" /></Button>
            <UserMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Workspace setup</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{state.workspace.name}</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">Set the goal and the product outcomes the trio is working towards, then invite your designer and tech lead. Everyone can add opportunities, solutions and experiments in the tree.</p>
        </div>
        <Suspense fallback={<LoadingPage />}>
          <SetupClient initial={state} />
        </Suspense>
      </main>
    </div>
  )
}

export function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return <HomePage />
  if (path === '/sign-in') return <AuthPage mode="sign-in" />
  if (path === '/sign-up') return <AuthPage mode="sign-up" />
  if (path === '/workspaces') return <WorkspacesPage />
  const join = path.match(/^\/join\/([^/]+)$/)
  if (join) return <JoinPage code={decodeURIComponent(join[1])} />
  const setup = path.match(/^\/w\/([^/]+)\/setup$/)
  if (setup) return <SetupPage id={decodeURIComponent(setup[1])} />
  const workspace = path.match(/^\/w\/([^/]+)$/)
  if (workspace) return <WorkspacePage id={decodeURIComponent(workspace[1])} />
  return <ErrorPage />
}
