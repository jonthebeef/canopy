'use client'

import { useCallback, useMemo, useRef } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import type {
  ActivityEvent,
  Evidence,
  EvidenceKind,
  NodeStatus,
  NodeType,
  TreeNode,
  WorkspaceState,
} from '@/lib/ost'

export const LIVE_SYNC_MS = 2_000

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Request failed')
  return body as T
}

export type EditableFields = Partial<{
  title: string
  description: string
  status: NodeStatus
  reach: number | null
  impact: number | null
  confidence: number | null
  effort: number | null
}>

export type EvidenceInput = {
  kind: EvidenceKind
  summary: string
  value?: string
  detail?: string
  source?: string
}

type EvidencePatch =
  | { op: 'update'; fields: Partial<Required<EvidenceInput>> }
  | { op: 'archive' }
  | { op: 'restore' }

type Patch =
  | { op: 'update'; fields: EditableFields }
  | { op: 'move'; parentId: string }
  | { op: 'archive'; reason?: string }
  | { op: 'restore' }

export function useWorkspace(workspaceId: string, fallbackData?: WorkspaceState) {
  const key = `/api/w/${workspaceId}/state`
  const { mutate: globalMutate } = useSWRConfig()
  const swr = useSWR<WorkspaceState>(key, (url: string) => fetchJson<WorkspaceState>(url), {
    fallbackData,
    refreshInterval: LIVE_SYNC_MS,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const { data, mutate } = swr

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data?.nodes])

  const refreshActivity = useCallback(
    () => globalMutate((k) => typeof k === 'string' && k.startsWith(`/api/w/${workspaceId}/activity`)),
    [globalMutate, workspaceId],
  )

  const applyLocal = useCallback(
    (nodeId: string, update: (n: TreeNode) => TreeNode) =>
      (current?: WorkspaceState) =>
        current && {
          ...current,
          nodes: current.nodes.map((n) => (n.id === nodeId ? update(n) : n)),
        },
    [],
  )

  // Overlapping optimistic mutations can resolve out of order and briefly clobber
  // each other's fields, so writes from this client are applied one at a time.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const patchNodeNow = useCallback(
    async (nodeId: string, patch: Patch) => {
      const now = Date.now()
      const optimistic = applyLocal(nodeId, (n) => {
        switch (patch.op) {
          case 'update':
            return { ...n, ...patch.fields, updatedAt: now }
          case 'move':
            return { ...n, parentId: patch.parentId, updatedAt: now }
          case 'archive':
            return { ...n, archivedAt: now, archiveReason: patch.reason ?? null }
          case 'restore':
            return { ...n, archivedAt: null, archiveReason: null }
        }
      })
      try {
        await mutate(
          async (current) => {
            const saved = await fetchJson<TreeNode>(`/api/w/${workspaceId}/nodes/${nodeId}`, {
              method: 'PATCH',
              body: JSON.stringify(patch),
            })
            return applyLocal(nodeId, () => saved)(current)
          },
          {
            optimisticData: (current) => optimistic(current) as WorkspaceState,
            rollbackOnError: true,
            revalidate: false,
          },
        )
        refreshActivity()
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save change')
        return false
      }
    },
    [applyLocal, mutate, refreshActivity, workspaceId],
  )

  const patchNode = useCallback(
    (nodeId: string, patch: Patch) => {
      const run = queue.current.then(() => patchNodeNow(nodeId, patch))
      queue.current = run.catch(() => undefined)
      return run
    },
    [patchNodeNow],
  )

  const createNode = useCallback(
    async (input: { parentId: string; type: NodeType; title: string }) => {
      try {
        const created = await fetchJson<TreeNode>(`/api/w/${workspaceId}/nodes`, {
          method: 'POST',
          body: JSON.stringify(input),
        })
        await mutate(
          (current) => current && { ...current, nodes: [...current.nodes, created] },
          { revalidate: false },
        )
        refreshActivity()
        return created
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not add item')
        return null
      }
    },
    [mutate, refreshActivity, workspaceId],
  )

  const createEvidence = useCallback(
    async (input: EvidenceInput & { nodeId: string }) => {
      try {
        const created = await fetchJson<Evidence>(`/api/w/${workspaceId}/evidence`, {
          method: 'POST',
          body: JSON.stringify(input),
        })
        await mutate(
          (current) => current && { ...current, evidence: [...current.evidence, created] },
          { revalidate: false },
        )
        refreshActivity()
        return created
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not add evidence')
        return null
      }
    },
    [mutate, refreshActivity, workspaceId],
  )

  const patchEvidenceNow = useCallback(
    async (evidenceId: string, patch: EvidencePatch) => {
      const now = Date.now()
      const replace = (current: WorkspaceState | undefined, next: (e: Evidence) => Evidence) =>
        current && {
          ...current,
          evidence: current.evidence.map((e) => (e.id === evidenceId ? next(e) : e)),
        }
      try {
        await mutate(
          async (current) => {
            const saved = await fetchJson<Evidence>(`/api/w/${workspaceId}/evidence/${evidenceId}`, {
              method: 'PATCH',
              body: JSON.stringify(patch),
            })
            return replace(current, () => saved)
          },
          {
            optimisticData: (current) =>
              replace(current, (e) =>
                patch.op === 'update'
                  ? { ...e, ...patch.fields, updatedAt: now }
                  : { ...e, archivedAt: patch.op === 'archive' ? now : null },
              ) as WorkspaceState,
            rollbackOnError: true,
            revalidate: false,
          },
        )
        refreshActivity()
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save evidence')
        return false
      }
    },
    [mutate, refreshActivity, workspaceId],
  )

  const patchEvidence = useCallback(
    (evidenceId: string, patch: EvidencePatch) => {
      const run = queue.current.then(() => patchEvidenceNow(evidenceId, patch))
      queue.current = run.catch(() => undefined)
      return run
    },
    [patchEvidenceNow],
  )

  return { ...swr, byId, patchNode, createNode, createEvidence, patchEvidence }
}

export function useActivity(workspaceId: string, nodeId?: string) {
  const key = `/api/w/${workspaceId}/activity${nodeId ? `?nodeId=${nodeId}` : ''}`
  return useSWR<ActivityEvent[]>(key, (url: string) => fetchJson<ActivityEvent[]>(url), {
    refreshInterval: LIVE_SYNC_MS * 3,
  })
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>
