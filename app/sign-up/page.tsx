import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { getSession } from '@/lib/auth'

export default async function SignUpPage({ searchParams }: PageProps<'/sign-up'>) {
  const { next } = await searchParams
  const nextPath = typeof next === 'string' ? next : undefined
  if ((await getSession())?.user) redirect(nextPath ?? '/workspaces')
  return (
    <AuthShell
      title="Create your account"
      subtitle="Each member of the trio gets their own login, so every change is attributed."
    >
      <AuthForm mode="sign-up" next={nextPath} />
    </AuthShell>
  )
}
