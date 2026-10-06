import { describe, expect, it } from 'vitest'
import { sortOrderBefore } from './tree-order'

const siblings = [
  { id: 'a', sortOrder: 10, createdAt: 10 },
  { id: 'b', sortOrder: 20, createdAt: 20 },
  { id: 'c', sortOrder: 30, createdAt: 30 },
]

describe('sortOrderBefore', () => {
  it('places an item before the first sibling', () => {
    expect(sortOrderBefore(siblings, 'c', 'a')).toBe(9)
  })

  it('places an item between two siblings', () => {
    expect(sortOrderBefore(siblings, 'c', 'b')).toBe(15)
  })

  it('places an item at the end', () => {
    expect(sortOrderBefore(siblings, 'a', null)).toBe(31)
  })

  it('returns the current value when the requested order is unchanged', () => {
    expect(sortOrderBefore(siblings, 'b', 'c')).toBe(20)
  })
})
