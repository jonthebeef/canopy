import { notFound } from 'next/navigation'
import { WorkspaceApp } from '@/components/ost/workspace-app'
import { requireUser } from '@/lib/auth'
import { HttpError, loadWorkspaceState } from '@/lib/workspace'

export const metadata = { title: 'Tree — Canopy' }

async function loadOrNotFound(id: string) {
  try {
    return await loadWorkspaceState(id)
  } catch (error) {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) notFound()
    throw error
  }
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/w/${id}`)
  const state = await loadOrNotFound(id)
  return <WorkspaceApp initial={state} user={{ name: user.name, email: user.email }} />
}
