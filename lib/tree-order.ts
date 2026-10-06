type OrderedNode = { id: string; sortOrder: number; createdAt: number }

/** Returns a stable sort value that places nodeId immediately before beforeId. */
export function sortOrderBefore(siblings: OrderedNode[], nodeId: string, beforeId: string | null) {
  const ordered = [...siblings].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt,
  )
  const current = ordered.find((node) => node.id === nodeId)
  if (!current) throw new Error('Item is not in this sibling group')

  const withoutCurrent = ordered.filter((node) => node.id !== nodeId)
  const insertAt =
    beforeId == null
      ? withoutCurrent.length
      : withoutCurrent.findIndex((node) => node.id === beforeId)
  if (insertAt < 0) throw new Error('Target is not in this sibling group')

  const proposed = [...withoutCurrent]
  proposed.splice(insertAt, 0, current)
  if (proposed.every((node, index) => node.id === ordered[index]?.id)) return current.sortOrder

  const previous = withoutCurrent[insertAt - 1]
  const next = withoutCurrent[insertAt]
  if (!previous && !next) return 0
  if (!previous) return next.sortOrder - 1
  if (!next) return previous.sortOrder + 1
  return (previous.sortOrder + next.sortOrder) / 2
}
