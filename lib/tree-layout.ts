import type { TreeNode } from './ost'

type LayoutOptions = {
  nodeWidth: number
  nodeHeight: number
  horizontalGap: number
  verticalGap: number
}

type Position = { x: number; y: number }

/**
 * A compact, deterministic top-down tree layout. Unlike a general graph
 * layout, this preserves the stored order of every sibling group.
 */
export function layoutTree(nodes: TreeNode[], options: LayoutOptions) {
  const { nodeWidth, nodeHeight, horizontalGap, verticalGap } = options
  const ids = new Set(nodes.map((node) => node.id))
  const children = new Map<string | null, TreeNode[]>()

  for (const node of nodes) {
    const parentId = node.parentId && ids.has(node.parentId) ? node.parentId : null
    children.set(parentId, [...(children.get(parentId) ?? []), node])
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  }

  const widths = new Map<string, number>()
  const measuring = new Set<string>()
  const measure = (id: string): number => {
    const saved = widths.get(id)
    if (saved != null) return saved
    if (measuring.has(id)) return nodeWidth
    measuring.add(id)
    const descendants = children.get(id) ?? []
    const descendantsWidth = descendants.reduce(
      (total, child, index) => total + measure(child.id) + (index === 0 ? 0 : horizontalGap),
      0,
    )
    const width = Math.max(nodeWidth, descendantsWidth)
    widths.set(id, width)
    measuring.delete(id)
    return width
  }

  const positions = new Map<string, Position>()
  const placed = new Set<string>()
  const place = (node: TreeNode, left: number, depth: number) => {
    if (placed.has(node.id)) return
    placed.add(node.id)
    const width = measure(node.id)
    positions.set(node.id, {
      x: left + (width - nodeWidth) / 2,
      y: depth * (nodeHeight + verticalGap),
    })
    let childLeft = left
    for (const child of children.get(node.id) ?? []) {
      place(child, childLeft, depth + 1)
      childLeft += measure(child.id) + horizontalGap
    }
  }

  let rootLeft = 0
  for (const root of children.get(null) ?? []) {
    place(root, rootLeft, 0)
    rootLeft += measure(root.id) + horizontalGap
  }

  return positions
}
