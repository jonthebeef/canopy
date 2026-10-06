import { describe, expect, it } from 'vitest'
import type { TreeNode } from './ost'
import { searchTreeNodes } from './tree-search'

function node(id: string, title: string, description = '', archivedAt: number | null = null): TreeNode {
  return {
    id,
    workspaceId: 'w',
    parentId: 'goal',
    type: 'opportunity',
    title,
    description,
    status: 'exploring',
    reach: null,
    impact: null,
    confidence: null,
    effort: null,
    sortOrder: 0,
    archivedAt,
    archivedBy: null,
    archiveReason: null,
    createdBy: 'u',
    createdAt: 0,
    updatedBy: 'u',
    updatedAt: 0,
  }
}

describe('searchTreeNodes', () => {
  const nodes = [
    node('prefix', 'Account registration'),
    node('contains', 'Improve account registration'),
    node('description', 'Reduce friction', 'Registration takes too long'),
    node('archived', 'Registration archive', '', 1),
  ]

  it('matches titles and descriptions case-insensitively and ranks title prefixes first', () => {
    expect(searchTreeNodes(nodes, 'REGISTRATION', false).map((result) => result.id)).toEqual([
      'prefix',
      'contains',
      'description',
    ])
  })

  it('excludes archived cards unless archived cards are visible', () => {
    expect(searchTreeNodes(nodes, 'archive', false)).toEqual([])
    expect(searchTreeNodes(nodes, 'archive', true).map((result) => result.id)).toEqual(['archived'])
  })

  it('excludes cards hidden beneath an archived ancestor', () => {
    const parent = node('parent', 'Old direction', '', 1)
    const child = { ...node('child', 'Hidden registration idea'), parentId: parent.id }

    expect(searchTreeNodes([parent, child], 'registration', false)).toEqual([])
    expect(searchTreeNodes([parent, child], 'registration', true).map((result) => result.id)).toEqual([
      'child',
    ])
  })

  it('does not return the whole tree for a blank query', () => {
    expect(searchTreeNodes(nodes, '   ', true)).toEqual([])
  })
})
