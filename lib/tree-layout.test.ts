import { describe, expect, it } from 'vitest'
import type { TreeNode } from './ost'
import { layoutTree } from './tree-layout'

function node(id: string, parentId: string | null, sortOrder: number): TreeNode {
  return {
    id,
    workspaceId: 'w',
    parentId,
    type: parentId ? 'outcome' : 'goal',
    title: id,
    description: '',
    status: 'exploring',
    reach: null,
    impact: null,
    confidence: null,
    effort: null,
    sortOrder,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    createdBy: 'u',
    createdAt: sortOrder,
    updatedBy: 'u',
    updatedAt: sortOrder,
  }
}

describe('layoutTree', () => {
  it('places siblings left to right by their stored sort order', () => {
    const nodes = [node('goal', null, 0), node('right', 'goal', 20), node('left', 'goal', 10)]

    const positions = layoutTree(nodes, { nodeWidth: 100, nodeHeight: 50, horizontalGap: 20, verticalGap: 30 })

    expect(positions.get('left')!.x).toBeLessThan(positions.get('right')!.x)
  })

  it('centres a parent over the span occupied by its children', () => {
    const nodes = [node('goal', null, 0), node('left', 'goal', 10), node('right', 'goal', 20)]

    const positions = layoutTree(nodes, { nodeWidth: 100, nodeHeight: 50, horizontalGap: 20, verticalGap: 30 })
    const leftCentre = positions.get('left')!.x + 50
    const rightCentre = positions.get('right')!.x + 50

    expect(positions.get('goal')!.x + 50).toBe((leftCentre + rightCentre) / 2)
    expect(positions.get('left')!.y).toBe(80)
  })

  it('keeps neighbouring subtrees from overlapping', () => {
    const nodes = [
      node('goal', null, 0),
      node('left', 'goal', 10),
      node('right', 'goal', 20),
      node('left-a', 'left', 10),
      node('left-b', 'left', 20),
      node('right-a', 'right', 10),
    ]

    const positions = layoutTree(nodes, { nodeWidth: 100, nodeHeight: 50, horizontalGap: 20, verticalGap: 30 })

    expect(positions.get('left-b')!.x + 100 + 20).toBeLessThanOrEqual(positions.get('right-a')!.x)
  })
})
