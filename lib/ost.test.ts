import { describe, expect, it } from 'vitest'
import { assertCanEdit, createNodeSchema } from './nodes'
import { ALLOWED_CHILDREN, NODE_TYPES, TYPE_LABEL } from './ost'
import { isScorable, rejectedScoringFields } from './scoring'
import { canAddChild, moveError, parentMap, sitsUnderOptions, validNewParents } from './tree'
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
  const parentIds = (id: string) => validNewParents(nodes.find((n) => n.id === id)!, nodes).map((r) => r.node.id)

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

describe('the server move rule (moveError)', () => {
  const tree = [
    { id: 'goal', parentId: null },
    { id: 'out', parentId: 'goal' },
    { id: 'opp', parentId: 'out' },
    { id: 'exp', parentId: 'opp' },
    { id: 'ins', parentId: 'exp' },
    { id: 'other', parentId: 'out' },
  ]
  const parents = parentMap(tree)
  const t = (id: string, type: TreeNode['type']) => ({ id, type })

  it('allows a legal move, including under an insight or an experiment', () => {
    expect(moveError(t('other', 'opportunity'), t('ins', 'insight'), parents)).toBeNull()
    expect(moveError(t('other', 'opportunity'), t('exp', 'experiment'), parents)).toBeNull()
  })

  it('never moves the goal', () => {
    expect(moveError(t('goal', 'goal'), t('out', 'outcome'), parents)).toMatch(/root/)
  })

  it('never puts anything under the goal except an outcome', () => {
    expect(moveError(t('opp', 'opportunity'), t('goal', 'goal'), parents)).toMatch(/can't sit under/)
    expect(moveError(t('out', 'outcome'), t('goal', 'goal'), parents)).toBeNull()
  })

  it("refuses to make a card its own parent or put it under its own descendant", () => {
    expect(moveError(t('opp', 'opportunity'), t('opp', 'opportunity'), parents)).toMatch(/own parent/)
    expect(moveError(t('opp', 'opportunity'), t('ins', 'insight'), parents)).toMatch(/underneath itself/)
    expect(moveError(t('opp', 'opportunity'), t('exp', 'experiment'), parents)).toMatch(/underneath itself/)
  })

  it('terminates on corrupt data that already contains a cycle', () => {
    const looped = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: null }]
    expect(moveError(t('c', 'opportunity'), t('a', 'opportunity'), parentMap(looped))).toBeNull()
  })
})

describe('who may edit which cards (assertCanEdit)', () => {
  it('lets only the admin change the goal and outcomes', () => {
    expect(() => assertCanEdit('member', 'goal')).toThrow()
    expect(() => assertCanEdit('member', 'outcome')).toThrow()
    expect(() => assertCanEdit('admin', 'goal')).not.toThrow()
    expect(() => assertCanEdit('admin', 'outcome')).not.toThrow()
  })

  it('lets contributors edit every other type', () => {
    for (const type of NODE_TYPES.filter((x) => x !== 'goal' && x !== 'outcome')) {
      expect(() => assertCanEdit('member', type)).not.toThrow()
    }
  })
})

describe('the "Sits under" list (validNewParents)', () => {
  const card = (id: string, type: TreeNode['type'], parentId: string | null, over: Partial<TreeNode> = {}): TreeNode => ({
    id, workspaceId: 'w', parentId, type, title: id, description: '', status: 'exploring',
    reach: null, impact: null, confidence: null, effort: null, scoringMethod: null, assessment: null,
    sortOrder: 0, archivedAt: null, archivedBy: null, archiveReason: null,
    createdBy: 'u', createdAt: 0, updatedBy: 'u', updatedAt: 0, ...over,
  })

  it('lists cards in tree order with their depth, and hides archived cards and everything beneath them', () => {
    const nodes = [
      card('goal', 'goal', null),
      card('out', 'outcome', 'goal'),
      card('a', 'opportunity', 'out', { sortOrder: 1 }),
      card('a-child', 'insight', 'a'),
      card('b', 'opportunity', 'out', { sortOrder: 2 }),
      card('gone', 'opportunity', 'out', { sortOrder: 3, archivedAt: 1 }),
      card('gone-child', 'insight', 'gone'),
      card('mover', 'question', 'out', { sortOrder: 4 }),
    ]
    const rows = validNewParents(nodes.find((n) => n.id === 'mover')!, nodes)
    expect(rows.map((r) => r.node.id)).toEqual(['out', 'a', 'a-child', 'b'])
    expect(rows.map((r) => r.depth)).toEqual([1, 2, 3, 2])
  })
})

describe('sitsUnderOptions', () => {
  const card = (id: string, type: TreeNode['type'], parentId: string | null, over: Partial<TreeNode> = {}): TreeNode => ({
    id, workspaceId: 'w', parentId, type, title: id, description: '', status: 'exploring',
    reach: null, impact: null, confidence: null, effort: null, scoringMethod: null, assessment: null,
    sortOrder: 0, archivedAt: null, archivedBy: null, archiveReason: null,
    createdBy: 'u', createdAt: 0, updatedBy: 'u', updatedAt: 0, ...over,
  })

  it('is just the legal parents when the current parent is visible', () => {
    const nodes = [card('goal', 'goal', null), card('out', 'outcome', 'goal'), card('a', 'opportunity', 'out'), card('b', 'solution', 'a')]
    const options = sitsUnderOptions(nodes[3], nodes)
    expect(options.map((o) => o.node.id)).toEqual(['out', 'a'])
    expect(options.every((o) => !o.hidden)).toBe(true)
  })

  it('still lists the current parent, flagged, when it is archived', () => {
    const nodes = [
      card('goal', 'goal', null),
      card('out', 'outcome', 'goal'),
      card('gone', 'opportunity', 'out', { archivedAt: 1 }),
      card('kid', 'solution', 'gone'),
    ]
    const options = sitsUnderOptions(nodes[3], nodes)
    expect(options[0]).toMatchObject({ hidden: true, depth: 0 })
    expect(options[0].node.id).toBe('gone')
    expect(options.slice(1).map((o) => o.node.id)).toEqual(['out'])
  })

  it('still lists the current parent when only an ancestor is archived', () => {
    const nodes = [
      card('goal', 'goal', null),
      card('out', 'outcome', 'goal'),
      card('gone', 'opportunity', 'out', { archivedAt: 1 }),
      card('mid', 'opportunity', 'gone'),
      card('kid', 'solution', 'mid'),
    ]
    const options = sitsUnderOptions(nodes[4], nodes)
    expect(options.find((o) => o.node.id === 'mid')?.hidden).toBe(true)
  })

  it('has no current parent to add for the goal', () => {
    const nodes = [card('goal', 'goal', null)]
    expect(sitsUnderOptions(nodes[0], nodes)).toEqual([])
  })
})
