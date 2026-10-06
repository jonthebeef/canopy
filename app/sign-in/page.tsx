import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { getSession } from '@/lib/auth'

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { next } = await searchParams
  const nextPath = typeof next === 'string' ? next : undefined
  if ((await getSession())?.user) redirect(nextPath ?? '/workspaces')
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to pick up where your trio left off.">
      <AuthForm mode="sign-in" next={nextPath} />
    </AuthShell>
  )
}
