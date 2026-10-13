import { describe, expect, it } from 'vitest'
import { createNodeSchema } from './nodes'
import { ALLOWED_CHILDREN, NODE_TYPES, TYPE_LABEL } from './ost'
import { isScorable, rejectedScoringFields } from './scoring'
import { canAddChild, validNewParents } from './tree'
import type { TreeNode } from './ost'

describe('insight node type', () => {
  it('is a labelled node type', () => {
    expect(NODE_TYPES).toContain('insight')
    expect(TYPE_LABEL.insight).toBe('Insight')
  })

  it('can sit under any card except the goal, and anything can sit under it', () => {
    for (const parent of NODE_TYPES.filter((t) => t !== 'goal')) {
      expect(ALLOWED_CHILDREN[parent]).toContain('insight')
    }
    expect(ALLOWED_CHILDREN.goal).not.toContain('insight')
    for (const child of NODE_TYPES.filter((t) => t !== 'goal')) {
      expect(ALLOWED_CHILDREN.insight).toContain(child)
    }
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

  it('refuses scoring fields on an insight, but allows clearing them and ordinary edits', () => {
    expect(rejectedScoringFields('insight', { impact: 5 })).toEqual(['impact'])
    expect(rejectedScoringFields('insight', { scoringMethod: 'rice', reach: 3 })).toEqual(['reach', 'scoringMethod'])
    expect(rejectedScoringFields('insight', { assessment: '{}' })).toEqual(['assessment'])
    expect(rejectedScoringFields('insight', { reach: null, scoringMethod: null })).toEqual([])
    expect(rejectedScoringFields('insight', { title: 'x', description: 'y', status: 'validated' })).toEqual([])
  })

  it('accepts scoring fields on every scored type', () => {
    for (const type of NODE_TYPES.filter((t) => t !== 'insight')) {
      expect(rejectedScoringFields(type, { impact: 5, scoringMethod: 'rice' })).toEqual([])
    }
  })

  it('gives every type an entry in the allowed-children map', () => {
    expect(Object.keys(ALLOWED_CHILDREN).sort()).toEqual([...NODE_TYPES].sort())
  })
})

describe('open-ended tree', () => {
  const nonGoal = NODE_TYPES.filter((t) => t !== 'goal')

  it('has no leaf type: every non-goal card can have every non-goal card beneath it', () => {
    for (const parent of nonGoal) {
      expect([...ALLOWED_CHILDREN[parent]].sort()).toEqual([...nonGoal].sort())
    }
  })

  it('keeps the goal as the single root that only takes outcomes', () => {
    expect(ALLOWED_CHILDREN.goal).toEqual(['outcome'])
    for (const parent of NODE_TYPES) {
      expect(ALLOWED_CHILDREN[parent]).not.toContain('goal')
    }
  })

  it('lists each type once per parent', () => {
    for (const parent of NODE_TYPES) {
      expect(new Set(ALLOWED_CHILDREN[parent]).size).toBe(ALLOWED_CHILDREN[parent].length)
    }
  })

  it('still offers the usual children first, so existing add-dialog defaults do not change', () => {
    expect(ALLOWED_CHILDREN.outcome.slice(0, 3)).toEqual(['question', 'insight', 'opportunity'])
    expect(ALLOWED_CHILDREN.question[0]).toBe('question')
    expect(ALLOWED_CHILDREN.opportunity[0]).toBe('question')
    expect(ALLOWED_CHILDREN.solution.slice(0, 2)).toEqual(['question', 'experiment'])
    expect(ALLOWED_CHILDREN.insight[0]).toBe('opportunity')
    expect(ALLOWED_CHILDREN.experiment[0]).toBe('insight')
  })

  it('lets contributors add the open-ended children, but never an outcome or goal', () => {
    for (const parent of nonGoal) {
      const options = canAddChild(parent, false)
      expect(options).not.toContain('outcome')
      expect(options).not.toContain('goal')
      expect(options).toEqual(expect.arrayContaining(['question', 'insight', 'opportunity', 'solution', 'experiment']))
    }
    expect(canAddChild('experiment', true)).toContain('outcome')
  })

  it('creates a card under an insight or an experiment through the API schema', () => {
    for (const type of nonGoal) {
      expect(createNodeSchema.safeParse({ parentId: 'p1', type, title: 't' }).success).toBe(true)
    }
  })
})

describe('moving cards in an open-ended tree', () => {
  const card = (id: string, type: TreeNode['type'], parentId: string | null): TreeNode => ({
    id, workspaceId: 'w', parentId, type, title: id, description: '', status: 'exploring',
    reach: null, impact: null, confidence: null, effort: null, scoringMethod: null, assessment: null,
    sortOrder: 0, archivedAt: null, archivedBy: null, archiveReason: null,
    createdBy: 'u', createdAt: 0, updatedBy: 'u', updatedAt: 0,
  })
  const nodes = [
    card('goal', 'goal', null),
    card('out', 'outcome', 'goal'),
    card('ins', 'insight', 'out'),
    card('opp', 'opportunity', 'ins'),
    card('exp', 'experiment', 'opp'),
    card('ins2', 'insight', 'exp'),
    card('opp2', 'opportunity', 'out'),
  ]
  const parentIds = (id: string) => validNewParents(nodes.find((n) => n.id === id)!, nodes).map((n) => n.id)

  it('allows moving a card under an insight or an experiment', () => {
    expect(parentIds('opp2')).toEqual(expect.arrayContaining(['ins', 'exp', 'ins2']))
    expect(parentIds('ins2')).toContain('ins')
  })

  it('still never allows a card under itself or its own descendants', () => {
    const ids = parentIds('ins')
    expect(ids).not.toContain('ins')
    expect(ids).not.toContain('opp')
    expect(ids).not.toContain('exp')
    expect(ids).not.toContain('ins2')
  })

  it('never offers the goal as something to move under a card', () => {
    expect(parentIds('goal')).toEqual([])
  })
})
