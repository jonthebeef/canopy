import { ALLOWED_CHILDREN, TYPE_LABEL, type NodeType, type TreeNode } from '@/lib/ost'

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

/**
 * Why `node` can't be moved under `target`, or null if it can. The server enforces this
 * on every move; `nodes` needs only id and parentId so it can be a cheap column select.
 */
export function moveError(
  node: Pick<TreeNode, 'id' | 'type'>,
  target: Pick<TreeNode, 'id' | 'type'>,
  nodes: Pick<TreeNode, 'id' | 'parentId'>[],
): string | null {
  if (node.type === 'goal') return 'The goal is the root of the tree'
  if (target.id === node.id) return "An item can't be its own parent"
  if (!ALLOWED_CHILDREN[target.type].includes(node.type)) {
    return `A ${TYPE_LABEL[node.type].toLowerCase()} can't sit under a ${TYPE_LABEL[target.type].toLowerCase()}`
  }
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  // Walk up from the target; meeting the node means the target is one of its descendants.
  const seen = new Set<string>()
  for (let cursor: string | null | undefined = target.id; cursor && !seen.has(cursor); cursor = parentOf.get(cursor)) {
    if (cursor === node.id) return "Can't move an item underneath itself"
    seen.add(cursor)
  }
  return null
}

/**
 * Cards `node` could legally be moved under, in tree order with their depth. Archived
 * cards, and anything beneath one, are left out: a card moved there would vanish.
 */
export function validNewParents(node: TreeNode, nodes: TreeNode[]) {
  return flattenTree(nodes, false).filter(({ node: p }) => moveError(node, p, nodes) === null)
}

export function canAddChild(parentType: NodeType, isAdmin: boolean) {
  return ALLOWED_CHILDREN[parentType].filter((t) => isAdmin || (t !== 'goal' && t !== 'outcome'))
}
