import { describe, expect, it } from 'vitest'
import { createNodeSchema } from './nodes'
import { ALLOWED_CHILDREN, NODE_TYPES, TYPE_LABEL } from './ost'
import { isScorable } from './scoring'
import { canAddChild } from './tree'

describe('insight node type', () => {
  it('is a labelled node type', () => {
    expect(NODE_TYPES).toContain('insight')
    expect(TYPE_LABEL.insight).toBe('Insight')
  })

  it('can sit under an outcome, a how might we, and an opportunity', () => {
    for (const parent of ['outcome', 'question', 'opportunity'] as const) {
      expect(ALLOWED_CHILDREN[parent]).toContain('insight')
    }
  })

  it('cannot sit under a goal, solution, experiment, or another insight', () => {
    for (const parent of ['goal', 'solution', 'experiment', 'insight'] as const) {
      expect(ALLOWED_CHILDREN[parent]).not.toContain('insight')
    }
  })

  it('is a leaf', () => {
    expect(ALLOWED_CHILDREN.insight).toEqual([])
  })

  it('can be added by contributors, not only admins', () => {
    expect(canAddChild('opportunity', false)).toContain('insight')
    expect(canAddChild('outcome', false)).toContain('insight')
  })

  it('is accepted by the create-node API schema', () => {
    expect(createNodeSchema.safeParse({ parentId: 'p1', type: 'insight', title: 'Users re-check sizes' }).success).toBe(true)
  })

  it('is not scorable, unlike the other prioritised types', () => {
    expect(isScorable('insight')).toBe(false)
    for (const type of NODE_TYPES.filter((t) => t !== 'insight')) {
      expect(isScorable(type)).toBe(true)
    }
  })

  it('gives every type an entry in the allowed-children map', () => {
    expect(Object.keys(ALLOWED_CHILDREN).sort()).toEqual([...NODE_TYPES].sort())
  })
})
