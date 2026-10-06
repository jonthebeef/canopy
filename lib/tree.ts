import { ALLOWED_CHILDREN, type NodeType, type TreeNode } from '@/lib/ost'

export type FlatRow = { node: TreeNode; depth: number; path: string[] }

export function childrenMap(nodes: TreeNode[], includeArchived: boolean) {
  const map = new Map<string | null, TreeNode[]>()
  for (const n of nodes) {
    if (!includeArchived && n.archivedAt) continue
    const list = map.get(n.parentId) ?? []
    list.push(n)
    map.set(n.parentId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
  return map
}

/** Depth-first ordering, so the table reads like the tree. */
export function flattenTree(nodes: TreeNode[], includeArchived = false): FlatRow[] {
  const kids = childrenMap(nodes, includeArchived)
  const out: FlatRow[] = []
  const visit = (parentId: string | null, depth: number, path: string[]) => {
    for (const node of kids.get(parentId) ?? []) {
      out.push({ node, depth, path })
      visit(node.id, depth + 1, [...path, node.title])
    }
  }
  visit(null, 0, [])
  return out
}

export function descendantIds(nodeId: string, nodes: TreeNode[]) {
  const kids = childrenMap(nodes, true)
  const out = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const id = stack.pop()!
    for (const child of kids.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}

/** Nodes that `node` could legally be moved under (no cycles, type rules respected). */
export function validNewParents(node: TreeNode, nodes: TreeNode[]) {
  const blocked = descendantIds(node.id, nodes)
  blocked.add(node.id)
  return nodes.filter(
    (p) => !p.archivedAt && !blocked.has(p.id) && ALLOWED_CHILDREN[p.type].includes(node.type),
  )
}

export function canAddChild(parentType: NodeType, isAdmin: boolean) {
  return ALLOWED_CHILDREN[parentType].filter((t) => isAdmin || (t !== 'goal' && t !== 'outcome'))
}
