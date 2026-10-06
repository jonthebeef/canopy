'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ALLOWED_CHILDREN, ancestry, riceScore, type TreeNode } from '@/lib/ost'
import { canAddChild, childrenMap, descendantIds } from '@/lib/tree'
import { layoutTree } from '@/lib/tree-layout'
import { sortOrderBefore } from '@/lib/tree-order'
import { searchTreeNodes } from '@/lib/tree-search'
import { cn } from '@/lib/utils'
import { useWs } from './context'
import { ScoreChip, StatusLabel, TypeTag } from './primitives'

const NODE_W = 248
const NODE_H = 132
const NODE_GAP = 28
const RANK_GAP = 64

type OstNodeData = {
  node: TreeNode
  childCount: number
  collapsed: boolean
  selected: boolean
  dropTarget: boolean
  dropBefore: boolean
  dropAfter: boolean
  canAdd: boolean
  onToggle: (id: string) => void
  onAdd: (node: TreeNode) => void
}
type OstFlowNode = Node<OstNodeData, 'ost'>

const OstNodeCard = memo(function OstNodeCard({ data }: NodeProps<OstFlowNode>) {
  const {
    node,
    childCount,
    collapsed,
    selected,
    dropTarget,
    dropBefore,
    dropAfter,
    canAdd,
    onToggle,
    onAdd,
  } = data
  const score = riceScore(node)
  const isRoot = node.type === 'goal'

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-shadow',
        isRoot && 'border-foreground/30',
        node.type === 'outcome' && 'border-primary/40',
        selected && 'ring-2 ring-primary',
        dropTarget && 'ring-2 ring-score ring-offset-2 ring-offset-canvas',
        node.archivedAt && 'border-dashed opacity-60',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      {dropBefore && (
        <span className="pointer-events-none absolute top-0 -left-3 h-full w-1 rounded-full bg-primary" />
      )}
      {dropAfter && (
        <span className="pointer-events-none absolute top-0 -right-3 h-full w-1 rounded-full bg-primary" />
      )}
      <Handle type="target" position={Position.Top} className="opacity-0" isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <TypeTag type={node.type} />
        <ScoreChip score={score} />
      </div>
      <p
        className={cn(
          'line-clamp-3 text-sm leading-snug font-medium text-pretty',
          node.archivedAt && 'line-through',
        )}
      >
        {node.title}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <StatusLabel status={node.status} />
        {childCount > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.id)
            }}
            className="nodrag inline-flex items-center gap-0.5 rounded-sm px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? `Expand ${childCount} children` : 'Collapse children'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            {childCount}
          </button>
        )}
      </div>
      {canAdd && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdd(node)
          }}
          className="nodrag absolute -bottom-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100 hover:border-primary hover:text-primary focus-visible:opacity-100"
          aria-label={`Add under ${node.title}`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" isConnectable={false} />
    </div>
  )
})

const nodeTypes = { ost: OstNodeCard }

type ReorderTarget = {
  nodeId: string
  parentId: string
  beforeId: string | null
  sortOrder: number
  afterId: string | null
}

function TreeCanvas() {
  const { state, byId, selectedId, select, showArchived, isAdmin, openAdd, patchNode } = useWs()
  const { fitView, setCenter } = useReactFlow()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget | null>(null)
  const [query, setQuery] = useState('')
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

  const toggle = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { visible, kids } = useMemo(() => {
    const childMap = childrenMap(state.nodes, showArchived)
    const output: TreeNode[] = []
    const walk = (parentId: string | null) => {
      for (const node of childMap.get(parentId) ?? []) {
        output.push(node)
        if (!collapsed.has(node.id)) walk(node.id)
      }
    }
    walk(null)
    return { visible: output, kids: childMap }
  }, [state.nodes, showArchived, collapsed])

  const layoutKey = visible
    .map((node) => `${node.id}:${node.parentId}:${node.sortOrder}`)
    .join('|')
  const positions = useMemo(
    () =>
      layoutTree(visible, {
        nodeWidth: NODE_W,
        nodeHeight: NODE_H,
        horizontalGap: NODE_GAP,
        verticalGap: RANK_GAP,
      }),
    [layoutKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const computedNodes = useMemo<OstFlowNode[]>(
    () =>
      visible.map((node) => ({
        id: node.id,
        type: 'ost',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        draggable: node.type !== 'goal' && !node.archivedAt && (isAdmin || node.type !== 'outcome'),
        data: {
          node,
          childCount: kids.get(node.id)?.length ?? 0,
          collapsed: collapsed.has(node.id),
          selected: node.id === selectedId,
          dropTarget: node.id === dropTargetId,
          dropBefore: node.id === reorderTarget?.beforeId,
          dropAfter: node.id === reorderTarget?.afterId,
          canAdd: !node.archivedAt && canAddChild(node.type, isAdmin).length > 0,
          onToggle: toggle,
          onAdd: openAdd,
        },
      })),
    [
      visible,
      positions,
      kids,
      collapsed,
      selectedId,
      dropTargetId,
      reorderTarget,
      isAdmin,
      toggle,
      openAdd,
    ],
  )

  const [nodes, setNodes] = useState<OstFlowNode[]>(computedNodes)
  useEffect(
    () =>
      setNodes((current) =>
        computedNodes.map((next) => {
          const existing = current.find((node) => node.id === next.id)
          return existing?.dragging
            ? { ...next, position: existing.position, dragging: true }
            : next
        }),
      ),
    [computedNodes],
  )

  const edges = useMemo<Edge[]>(
    () =>
      visible
        .filter((node) => node.parentId && positions.has(node.parentId))
        .map((node) => ({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId!,
          target: node.id,
          type: 'smoothstep',
          style: {
            stroke: 'var(--muted-foreground)',
            strokeOpacity: node.archivedAt ? 0.25 : 0.5,
            strokeDasharray: node.archivedAt ? '4 4' : undefined,
          },
        })),
    [visible, positions],
  )

  useEffect(() => {
    const timeout = setTimeout(
      () => fitView({ padding: 0.15, duration: 300, maxZoom: 1 }),
      50,
    )
    return () => clearTimeout(timeout)
    // Refit only when the set of visible nodes changes shape, not on every edit.
  }, [visible.length, showArchived, fitView]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingFocusId) return
    const position = positions.get(pendingFocusId)
    if (!position) return
    const timeout = setTimeout(() => {
      setCenter(position.x + NODE_W / 2, position.y + NODE_H / 2, {
        zoom: 1,
        duration: 400,
      })
      setPendingFocusId(null)
    }, 50)
    return () => clearTimeout(timeout)
  }, [pendingFocusId, positions, setCenter])

  const onNodesChange = useCallback(
    (changes: NodeChange<OstFlowNode>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    [],
  )

  const findReorderTarget = useCallback(
    (dragged: OstFlowNode): ReorderTarget | null => {
      const self = byId.get(dragged.id)
      if (!self?.parentId) return null
      const siblings = nodes
        .filter(
          (candidate) =>
            candidate.id !== dragged.id && candidate.data.node.parentId === self.parentId,
        )
        .sort((a, b) => a.position.x - b.position.x)
      if (siblings.length === 0) return null

      const centreX = dragged.position.x + NODE_W / 2
      const centreY = dragged.position.y + NODE_H / 2
      const siblingY = siblings[0].position.y + NODE_H / 2
      if (Math.abs(centreY - siblingY) > NODE_H * 0.75) return null

      const beforeId =
        siblings.find((candidate) => centreX < candidate.position.x + NODE_W / 2)?.id ?? null
      const sortOrder = sortOrderBefore(
        kids.get(self.parentId) ?? [],
        self.id,
        beforeId,
      )
      const afterId = beforeId == null ? (siblings.at(-1)?.id ?? null) : null
      return { nodeId: self.id, parentId: self.parentId, beforeId, sortOrder, afterId }
    },
    [byId, kids, nodes],
  )

  const findDropTarget = useCallback(
    (dragged: OstFlowNode) => {
      const self = byId.get(dragged.id)
      if (!self) return null
      const blocked = descendantIds(self.id, state.nodes)
      const centreX = dragged.position.x + NODE_W / 2
      const centreY = dragged.position.y + NODE_H / 2
      for (const candidate of nodes) {
        if (
          candidate.id === dragged.id ||
          candidate.data.node.parentId === self.parentId ||
          blocked.has(candidate.id)
        ) {
          continue
        }
        const target = candidate.data.node
        if (target.archivedAt || !ALLOWED_CHILDREN[target.type].includes(self.type)) continue
        const { x, y } = candidate.position
        if (
          centreX > x &&
          centreX < x + NODE_W &&
          centreY > y &&
          centreY < y + NODE_H
        ) {
          return target
        }
      }
      return null
    },
    [byId, nodes, state.nodes],
  )

  const updateDragTargets = useCallback(
    (dragged: OstFlowNode) => {
      const reorder = findReorderTarget(dragged)
      setReorderTarget(reorder)
      setDropTargetId(reorder ? null : (findDropTarget(dragged)?.id ?? null))
    },
    [findDropTarget, findReorderTarget],
  )

  const searchResults = useMemo(
    () => searchTreeNodes(state.nodes, query, showArchived).slice(0, 8),
    [query, showArchived, state.nodes],
  )

  const reveal = useCallback(
    (node: TreeNode) => {
      const ancestors = ancestry(node.id, byId)
      setCollapsed((previous) => {
        const next = new Set(previous)
        for (const ancestor of ancestors) next.delete(ancestor.id)
        return next
      })
      select(node.id)
      setPendingFocusId(node.id)
      setQuery('')
    },
    [byId, select],
  )

  return (
    <ReactFlow<OstFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => select(node.id)}
      onPaneClick={() => select(null)}
      onNodeDrag={(_, node) => updateDragTargets(node)}
      onNodeDragStop={(_, node) => {
        const reorder = findReorderTarget(node)
        const target = reorder ? null : findDropTarget(node)
        setReorderTarget(null)
        setDropTargetId(null)
        const self = byId.get(node.id)

        if (reorder && self && reorder.sortOrder !== self.sortOrder) {
          patchNode(node.id, {
            op: 'reorder',
            beforeId: reorder.beforeId,
            sortOrder: reorder.sortOrder,
          }).then(
            (ok) => ok && toast.success('Card order updated'),
          )
        } else if (target && self && target.id !== self.parentId) {
          patchNode(node.id, { op: 'move', parentId: target.id }).then(
            (ok) => ok && toast.success(`Moved under "${target.title}"`),
          )
        }
        setNodes(computedNodes)
      }}
      nodesConnectable={false}
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="bg-canvas"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="var(--border)"
      />
      <Controls showInteractive={false} className="!shadow-xs" />
      <MiniMap
        pannable
        zoomable
        className="!hidden !bg-card md:!block"
        nodeColor={(node) => {
          const type = (node.data as OstNodeData).node.type
          return type === 'goal'
            ? 'var(--foreground)'
            : type === 'outcome'
              ? 'var(--primary)'
              : type === 'question'
                ? 'oklch(0.7 0.1 230)'
                : type === 'solution'
                  ? 'var(--score)'
                  : 'var(--border)'
        }}
        maskColor="color-mix(in oklch, var(--canvas) 70%, transparent)"
      />

      <Panel position="top-right" className="!m-3 w-[min(22rem,calc(100vw-2rem))]">
        <div className="nodrag nopan relative">
          <label className="relative flex items-center">
            <span className="sr-only">Search tree cards</span>
            <Search
              className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) reveal(searchResults[0])
                if (event.key === 'Escape') setQuery('')
              }}
              placeholder="Find a card…"
              className="h-9 w-full rounded-md border border-input bg-card/95 pr-9 pl-9 text-sm shadow-xs outline-none backdrop-blur focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery('')}
                className="absolute right-1"
                aria-label="Clear search"
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </label>

          {query.trim() && (
            <div className="absolute top-10 right-0 left-0 overflow-hidden rounded-md border bg-popover shadow-lg">
              {searchResults.length > 0 ? (
                <ul className="max-h-80 overflow-y-auto py-1" aria-label="Search results">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => reveal(result)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <TypeTag type={result.type} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          {result.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {result.description}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-sm text-muted-foreground">No matching cards</p>
              )}
            </div>
          )}
        </div>
      </Panel>
    </ReactFlow>
  )
}

export function TreeView() {
  return (
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <TreeCanvas />
      </ReactFlowProvider>
      <p className="pointer-events-none absolute top-3 left-3 hidden rounded-md bg-card/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-xs lg:block">
        Drag across a row to reorder · drag onto another tier to re-parent · hover and press + to add
      </p>
    </div>
  )
}
