'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import dagre from '@dagrejs/dagre'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
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
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ALLOWED_CHILDREN, riceScore, type TreeNode } from '@/lib/ost'
import { canAddChild, childrenMap, descendantIds } from '@/lib/tree'
import { cn } from '@/lib/utils'
import { useWs } from './context'
import { ScoreChip, StatusLabel, TypeTag } from './primitives'

const NODE_W = 248
const NODE_H = 132

type OstNodeData = {
  node: TreeNode
  childCount: number
  collapsed: boolean
  selected: boolean
  dropTarget: boolean
  canAdd: boolean
  onToggle: (id: string) => void
  onAdd: (node: TreeNode) => void
}
type OstFlowNode = Node<OstNodeData, 'ost'>

const OstNodeCard = memo(function OstNodeCard({ data }: NodeProps<OstFlowNode>) {
  const { node, childCount, collapsed, selected, dropTarget, canAdd, onToggle, onAdd } = data
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
      <Handle type="target" position={Position.Top} className="opacity-0" isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <TypeTag type={node.type} />
        <ScoreChip score={score} />
      </div>
      <p className={cn('line-clamp-3 text-sm leading-snug font-medium text-pretty', node.archivedAt && 'line-through')}>
        {node.title}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <StatusLabel status={node.status} />
        {childCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
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
          onClick={(e) => {
            e.stopPropagation()
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

function layout(visible: TreeNode[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 64, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of visible) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  const ids = new Set(visible.map((n) => n.id))
  for (const n of visible) if (n.parentId && ids.has(n.parentId)) g.setEdge(n.parentId, n.id)
  dagre.layout(g)
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of visible) {
    const p = g.node(n.id)
    pos.set(n.id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 })
  }
  return pos
}

function TreeCanvas() {
  const { state, byId, selectedId, select, showArchived, isAdmin, openAdd, patchNode } = useWs()
  const { fitView } = useReactFlow()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { visible, kids } = useMemo(() => {
    const kids = childrenMap(state.nodes, showArchived)
    const out: TreeNode[] = []
    const walk = (parentId: string | null) => {
      for (const n of kids.get(parentId) ?? []) {
        out.push(n)
        if (!collapsed.has(n.id)) walk(n.id)
      }
    }
    walk(null)
    return { visible: out, kids }
  }, [state.nodes, showArchived, collapsed])

  const layoutKey = visible.map((n) => `${n.id}:${n.parentId}`).join('|')
  const positions = useMemo(() => layout(visible), [layoutKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const computedNodes = useMemo<OstFlowNode[]>(
    () =>
      visible.map((n) => ({
        id: n.id,
        type: 'ost',
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        draggable: n.type !== 'goal' && !n.archivedAt && (isAdmin || n.type !== 'outcome'),
        data: {
          node: n,
          childCount: kids.get(n.id)?.length ?? 0,
          collapsed: collapsed.has(n.id),
          selected: n.id === selectedId,
          dropTarget: n.id === dropTargetId,
          canAdd: !n.archivedAt && canAddChild(n.type, isAdmin).length > 0,
          onToggle: toggle,
          onAdd: openAdd,
        },
      })),
    [visible, positions, kids, collapsed, selectedId, dropTargetId, isAdmin, toggle, openAdd],
  )

  const [nodes, setNodes] = useState<OstFlowNode[]>(computedNodes)
  useEffect(() => setNodes(computedNodes), [computedNodes])

  const edges = useMemo<Edge[]>(
    () =>
      visible
        .filter((n) => n.parentId && positions.has(n.parentId))
        .map((n) => ({
          id: `${n.parentId}-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: 'smoothstep',
          style: {
            stroke: 'var(--muted-foreground)',
            strokeOpacity: n.archivedAt ? 0.25 : 0.5,
            strokeDasharray: n.archivedAt ? '4 4' : undefined,
          },
        })),
    [visible, positions],
  )

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300, maxZoom: 1 }), 50)
    return () => clearTimeout(t)
    // Refit only when the set of visible nodes changes shape, not on every edit.
  }, [visible.length, showArchived, fitView]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback(
    (changes: NodeChange<OstFlowNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  const findDropTarget = useCallback(
    (dragged: OstFlowNode) => {
      const self = byId.get(dragged.id)
      if (!self) return null
      const blocked = descendantIds(self.id, state.nodes)
      const cx = dragged.position.x + NODE_W / 2
      const cy = dragged.position.y + NODE_H / 2
      for (const candidate of nodes) {
        if (candidate.id === dragged.id || blocked.has(candidate.id)) continue
        const target = candidate.data.node
        if (target.archivedAt || !ALLOWED_CHILDREN[target.type].includes(self.type)) continue
        const { x, y } = candidate.position
        if (cx > x && cx < x + NODE_W && cy > y && cy < y + NODE_H) return target
      }
      return null
    },
    [byId, nodes, state.nodes],
  )

  return (
    <ReactFlow<OstFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => select(n.id)}
      onPaneClick={() => select(null)}
      onNodeDrag={(_, n) => setDropTargetId(findDropTarget(n)?.id ?? null)}
      onNodeDragStop={(_, n) => {
        const target = findDropTarget(n)
        setDropTargetId(null)
        const self = byId.get(n.id)
        if (target && self && target.id !== self.parentId) {
          patchNode(n.id, { op: 'move', parentId: target.id }).then(
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
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} className="!shadow-xs" />
      <MiniMap
        pannable
        zoomable
        className="!hidden !bg-card md:!block"
        nodeColor={(n) => {
          const t = (n.data as OstNodeData).node.type
          return t === 'goal'
            ? 'var(--foreground)'
            : t === 'outcome'
              ? 'var(--primary)'
              : t === 'solution'
                ? 'var(--score)'
                : 'var(--border)'
        }}
        maskColor="color-mix(in oklch, var(--canvas) 70%, transparent)"
      />
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
        Drag a card onto another to re-parent it · hover a card and press + to add beneath
      </p>
    </div>
  )
}
