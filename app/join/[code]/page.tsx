import { eq } from 'drizzle-orm'
import { AuthShell } from '@/components/auth-shell'
import { JoinWorkspaceForm } from '@/components/workspace-forms'
import { requireUser } from '@/lib/auth'
import { getDb, schema } from '@/lib/db'

export default async function JoinPage({ params }: PageProps<'/join/[code]'>) {
  const { code } = await params
  await requireUser(`/join/${code}`)
  const db = await getDb()
  const ws = await db.query.workspace.findFirst({ where: eq(schema.workspace.inviteCode, code) })

  return (
    <AuthShell
      title={ws ? `Join ${ws.name}` : 'Invite not found'}
      subtitle={
        ws
          ? "You've been invited to collaborate on this opportunity solution tree."
          : 'This invite link has expired or been reset. Ask your PM for a new one.'
      }
    >
      {ws ? <JoinWorkspaceForm defaultCode={code} /> : <JoinWorkspaceForm />}
    </AuthShell>
  )
}
