import { describe, expect, it } from 'vitest'
import { patchNodeSchema } from './nodes'
import {
  assessmentCount,
  effectiveMethod,
  emptyAssessment,
  impactEffortScore,
  isScored,
  methodScore,
  parseAssessment,
  quadrant,
  serializeAssessment,
} from './scoring'

const base = {
  type: 'solution' as const,
  scoringMethod: null,
  reach: null,
  impact: null,
  confidence: null,
  effort: null,
  assessment: null,
}

describe('effectiveMethod', () => {
  it('honours an explicit choice', () => {
    expect(effectiveMethod({ ...base, type: 'opportunity', scoringMethod: 'rice' })).toBe('rice')
  })
  it('defaults opportunities to assessment and everything else to RICE', () => {
    expect(effectiveMethod({ ...base, type: 'opportunity' })).toBe('assessment')
    expect(effectiveMethod(base)).toBe('rice')
  })
  it('keeps impact and effort visible on opportunities scored before this existed', () => {
    expect(effectiveMethod({ ...base, type: 'opportunity', impact: 6 })).toBe('impact_effort')
    expect(effectiveMethod({ ...base, type: 'opportunity', effort: 2 })).toBe('impact_effort')
    // RICE wins when RICE-only fields are present, and non-opportunities stay on RICE.
    expect(effectiveMethod({ ...base, type: 'opportunity', impact: 6, reach: 5 })).toBe('rice')
    expect(effectiveMethod({ ...base, impact: 6 })).toBe('rice')
  })
  it('keeps RICE for opportunities that were already RICE-scored', () => {
    expect(effectiveMethod({ ...base, type: 'opportunity', reach: 5 })).toBe('rice')
    expect(effectiveMethod({ ...base, type: 'opportunity', confidence: 50 })).toBe('rice')
  })
})

describe('impact / effort', () => {
  it('needs both values and a positive effort', () => {
    expect(impactEffortScore({ impact: null, effort: 2 })).toBeNull()
    expect(impactEffortScore({ impact: 5, effort: null })).toBeNull()
    expect(impactEffortScore({ impact: 5, effort: 0 })).toBeNull()
    expect(impactEffortScore({ impact: 6, effort: 2 })).toBe(3)
  })
  it('rejects values outside the 0-10 scale', () => {
    expect(impactEffortScore({ impact: 2000, effort: 2 })).toBeNull()
    expect(impactEffortScore({ impact: 5, effort: 50 })).toBeNull()
  })
  it('places the four quadrants, with 5 counting as the high side for impact and low side for effort', () => {
    expect(quadrant({ impact: 8, effort: 2 })).toBe('Quick win')
    expect(quadrant({ impact: 8, effort: 8 })).toBe('Big bet')
    expect(quadrant({ impact: 2, effort: 2 })).toBe('Fill-in')
    expect(quadrant({ impact: 2, effort: 8 })).toBe('Money pit')
    expect(quadrant({ impact: 5, effort: 5 })).toBe('Quick win')
    expect(quadrant({ impact: null, effort: 5 })).toBeNull()
  })
})

describe('methodScore', () => {
  const scored = { ...base, reach: 8, impact: 6, confidence: 50, effort: 2 }
  it('only scores a node under the method it is on', () => {
    expect(methodScore({ ...scored, scoringMethod: 'rice' }, 'rice')).toBe(12)
    expect(methodScore({ ...scored, scoringMethod: 'rice' }, 'impact_effort')).toBeNull()
    expect(methodScore({ ...scored, scoringMethod: 'impact_effort' }, 'impact_effort')).toBe(3)
    expect(methodScore({ ...scored, scoringMethod: 'impact_effort' }, 'rice')).toBeNull()
  })
  it('never ranks an assessment', () => {
    expect(methodScore({ ...scored, scoringMethod: 'assessment' }, 'assessment')).toBeNull()
  })
})

describe('assessment', () => {
  const filled = () => {
    const a = emptyAssessment()
    a.customer = { note: 'Weakest area', confidence: 'weak' }
    return a
  }

  it('round-trips through its canonical string', () => {
    const raw = serializeAssessment(filled())
    expect(raw).not.toBeNull()
    expect(parseAssessment(raw)).toEqual(filled())
    expect(serializeAssessment(parseAssessment(raw)!)).toBe(raw)
  })
  it('serialises a blank assessment to null so it clears the column', () => {
    expect(serializeAssessment(emptyAssessment())).toBeNull()
    const a = emptyAssessment()
    a.size.note = '   '
    expect(serializeAssessment(a)).toBeNull()
  })
  it('rejects malformed input', () => {
    expect(parseAssessment(null)).toBeNull()
    expect(parseAssessment('')).toBeNull()
    expect(parseAssessment('not json')).toBeNull()
    expect(parseAssessment('[]')).toBeNull()
    expect(parseAssessment('{"nope":{"note":"","confidence":null}}')).toBeNull()
    expect(parseAssessment('{"size":{"note":"","confidence":"great"}}')).toBeNull()
    expect(parseAssessment(`{"size":{"note":"${'x'.repeat(1001)}","confidence":null}}`)).toBeNull()
  })
  it('counts only rated factors as scored', () => {
    const onlyNote = emptyAssessment()
    onlyNote.size.note = 'thinking about it'
    const node = { ...base, type: 'opportunity' as const, assessment: serializeAssessment(onlyNote) }
    expect(assessmentCount(node)).toBe(0)
    expect(isScored(node)).toBe(false)
    const rated = { ...node, assessment: serializeAssessment(filled()) }
    expect(assessmentCount(rated)).toBe(1)
    expect(isScored(rated)).toBe(true)
  })
})

describe('patchNodeSchema', () => {
  const parse = (fields: Record<string, unknown>) =>
    patchNodeSchema.safeParse({ op: 'update', fields })

  it('accepts a method choice and a valid assessment', () => {
    expect(parse({ scoringMethod: 'impact_effort' }).success).toBe(true)
    expect(parse({ scoringMethod: null }).success).toBe(true)
    const valid = { ...emptyAssessment(), size: { note: 'x', confidence: 'strong' as const } }
    expect(parse({ assessment: serializeAssessment(valid) }).success).toBe(true)
    expect(parse({ assessment: null }).success).toBe(true)
  })
  it('accepts four maximum-length notes even when JSON escaping inflates them', () => {
    const long = { note: '\n'.repeat(1000), confidence: 'weak' as const }
    const raw = serializeAssessment({ size: long, market: long, company: long, customer: long })!
    expect(raw.length).toBeGreaterThan(6000)
    expect(parse({ assessment: raw }).success).toBe(true)
  })
  it('only stores the canonical form of an assessment', () => {
    const canonical = serializeAssessment({ ...emptyAssessment(), size: { note: 'x', confidence: 'strong' } })!
    expect(parse({ assessment: canonical }).success).toBe(true)
    expect(parse({ assessment: '{}' }).success).toBe(false)
    expect(parse({ assessment: canonical.replace('"note":"x"', '"extra":1,"note":"x"') }).success).toBe(false)
    expect(parse({ assessment: ` ${canonical}` }).success).toBe(false)
    // An all-blank assessment is stored as null, never as a blank blob.
    expect(parse({ assessment: JSON.stringify(emptyAssessment()) }).success).toBe(false)
  })
  it('rejects unknown methods and invalid assessments', () => {
    expect(parse({ scoringMethod: 'moscow' }).success).toBe(false)
    expect(parse({ assessment: 'garbage' }).success).toBe(false)
    expect(parse({ assessment: '{"size":{"note":1,"confidence":null}}' }).success).toBe(false)
  })
})
