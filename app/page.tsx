import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Archive, GitBranch, Table2, Users } from 'lucide-react'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth'

const FEATURES = [
  {
    icon: GitBranch,
    title: 'One tree, two views',
    body: 'Map outcomes, opportunities, solutions and experiments on a canvas, or edit the same records in a sortable table.',
  },
  {
    icon: Table2,
    title: 'RICE on anything',
    body: 'Optionally score any node. Scores compute automatically and export straight to CSV for your spreadsheet.',
  },
  {
    icon: Users,
    title: 'Built for the trio',
    body: 'PM, designer and engineer each sign in. Edits sync live and every change carries a name.',
  },
  {
    icon: Archive,
    title: 'Nothing silently disappears',
    body: 'Removing an idea archives it with a reason. The full history is audited and anything can be restored.',
  },
]

export default async function Home() {
  if ((await getSession())?.user) redirect('/workspaces')

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button nativeButton={false} render={<Link href="/sign-up" />}>Get started</Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-16 pb-20 md:pt-24">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Opportunity Solution Trees
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Your discovery work, structured instead of stickied.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Canopy gives your product trio a shared, auditable opportunity solution tree. Build it
            visually, score it in a table, and never lose track of why an idea was dropped.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/sign-up" />}>
              Create a workspace
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/sign-in" />}>
              I have an invite
            </Button>
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

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-sm text-muted-foreground">
        Runs on Cloudflare Workers + D1.
      </footer>
    </div>
  )
}
