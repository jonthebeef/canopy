import { isEffectivelyArchived, type TreeNode } from './ost'

export function searchTreeNodes(nodes: TreeNode[], query: string, includeArchived: boolean) {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return nodes
    .filter((node) => includeArchived || !isEffectivelyArchived(node.id, byId))
    .map((node) => {
      const title = node.title.toLocaleLowerCase()
      const description = node.description.toLocaleLowerCase()
      const rank = title.startsWith(term)
        ? 0
        : title.includes(term)
          ? 1
          : description.includes(term)
            ? 2
            : -1
      return { node, rank }
    })
    .filter(({ rank }) => rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.node.title.localeCompare(b.node.title) ||
        a.node.sortOrder - b.node.sortOrder,
    )
    .map(({ node }) => node)
}
