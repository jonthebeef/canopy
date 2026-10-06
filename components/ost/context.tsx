'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TreeNode, WorkspaceState } from '@/lib/ost'
import { useWorkspace, type WorkspaceApi } from '@/lib/use-workspace'

type AddTarget = { parent: TreeNode } | null

type Ctx = WorkspaceApi & {
  state: WorkspaceState
  isAdmin: boolean
  memberName: (userId: string) => string
  selectedId: string | null
  select: (id: string | null) => void
  addTarget: AddTarget
  openAdd: (parent: TreeNode) => void
  closeAdd: () => void
  showArchived: boolean
  setShowArchived: (v: boolean) => void
}

const WorkspaceCtx = createContext<Ctx | null>(null)

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceState
  children: ReactNode
}) {
  const api = useWorkspace(initial.workspace.id, initial)
  const state = api.data ?? initial
  const [selectedId, select] = useState<string | null>(null)
  const [addTarget, setAddTarget] = useState<AddTarget>(null)
  const [showArchived, setShowArchived] = useState(false)

  const names = useMemo(
    () => new Map(state.members.map((m) => [m.userId, m.name])),
    [state.members],
  )

  const value: Ctx = {
    ...api,
    state,
    isAdmin: state.me.role === 'admin',
    memberName: (id) => names.get(id) ?? 'Former member',
    selectedId: selectedId && api.byId.has(selectedId) ? selectedId : null,
    select,
    addTarget,
    openAdd: (parent) => setAddTarget({ parent }),
    closeAdd: () => setAddTarget(null),
    showArchived,
    setShowArchived,
  }

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>
}

export function useWs() {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWs must be used inside WorkspaceProvider')
  return ctx
}
