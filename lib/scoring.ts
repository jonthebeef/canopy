import { RICE_MAX, riceScore, type NodeType, type TreeNode } from '@/lib/ost'

export const SCORING_METHODS = ['rice', 'impact_effort', 'assessment'] as const
export type ScoringMethod = (typeof SCORING_METHODS)[number]

export const METHOD_LABEL: Record<ScoringMethod, string> = {
  rice: 'RICE',
  impact_effort: 'Impact / effort',
  assessment: 'Assessment',
}

/** Methods that reduce to a single number, so they can be ranked. */
export const RANKABLE_METHODS = ['rice', 'impact_effort'] as const satisfies readonly ScoringMethod[]
export type RankableMethod = (typeof RANKABLE_METHODS)[number]

export const ASSESSMENT_FACTORS = ['size', 'market', 'company', 'customer'] as const
export type AssessmentFactor = (typeof ASSESSMENT_FACTORS)[number]

export const FACTOR_LABEL: Record<AssessmentFactor, string> = {
  size: 'Opportunity size',
  market: 'Market factors',
  company: 'Company factors',
  customer: 'Customer factors',
}

export const ASSESSMENT_CONFIDENCES = ['strong', 'weak', 'unknown'] as const
export type AssessmentConfidence = (typeof ASSESSMENT_CONFIDENCES)[number]

export const CONFIDENCE_LABEL: Record<AssessmentConfidence, string> = {
  strong: 'Strong evidence',
  weak: 'Weak evidence',
  unknown: 'Unknown',
}

export type FactorAssessment = { note: string; confidence: AssessmentConfidence | null }
export type Assessment = Record<AssessmentFactor, FactorAssessment>

export const NOTE_MAX = 1000

export function emptyAssessment(): Assessment {
  return Object.fromEntries(
    ASSESSMENT_FACTORS.map((f) => [f, { note: '', confidence: null }]),
  ) as Assessment
}

function isConfidence(v: unknown): v is AssessmentConfidence {
  return typeof v === 'string' && (ASSESSMENT_CONFIDENCES as readonly string[]).includes(v)
}

/** Returns a clean Assessment, or null if `raw` isn't valid assessment JSON. */
export function parseAssessment(raw: string | null | undefined): Assessment | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const out = emptyAssessment()
  for (const [key, value] of Object.entries(data)) {
    if (!(ASSESSMENT_FACTORS as readonly string[]).includes(key)) return null
    if (typeof value !== 'object' || value === null) return null
    const { note, confidence } = value as Record<string, unknown>
    if (typeof note !== 'string' || note.length > NOTE_MAX) return null
    if (confidence !== null && !isConfidence(confidence)) return null
    out[key as AssessmentFactor] = { note, confidence }
  }
  return out
}

/** Canonical form, so the same assessment always compares equal as a string. */
export function serializeAssessment(a: Assessment): string | null {
  const blank = ASSESSMENT_FACTORS.every((f) => !a[f].note.trim() && a[f].confidence === null)
  if (blank) return null
  return JSON.stringify(Object.fromEntries(ASSESSMENT_FACTORS.map((f) => [f, a[f]])))
}

/** Write-side check: only the exact canonical form we store is accepted. */
export function isValidAssessment(raw: string): boolean {
  const parsed = parseAssessment(raw)
  return parsed !== null && serializeAssessment(parsed) === raw
}

type MethodFields = Pick<
  TreeNode,
  'type' | 'scoringMethod' | 'reach' | 'impact' | 'confidence' | 'effort'
>

/** Opportunities start on Assessment; anything already scored keeps the method its numbers fit. */
export function effectiveMethod(n: MethodFields): ScoringMethod {
  if (n.scoringMethod) return n.scoringMethod
  if (n.reach != null || n.confidence != null) return 'rice'
  const fallback = defaultMethod(n.type)
  // Opportunities now default to assessment; don't hide numbers already entered.
  if (fallback === 'assessment' && (n.impact != null || n.effort != null)) return 'impact_effort'
  return fallback
}

/** Insights record a user need; they aren't prioritised, so they carry no score. */
export function isScorable(type: NodeType): boolean {
  return type !== 'insight'
}

export function defaultMethod(type: NodeType): ScoringMethod {
  return type === 'opportunity' ? 'assessment' : 'rice'
}

export function impactEffortScore(n: Pick<TreeNode, 'impact' | 'effort'>): number | null {
  const { impact, effort } = n
  if (impact == null || effort == null || effort <= 0) return null
  if (impact < 0 || impact > RICE_MAX || effort > RICE_MAX) return null
  return impact / effort
}

export type Quadrant = 'Quick win' | 'Big bet' | 'Fill-in' | 'Money pit'

const MIDPOINT = RICE_MAX / 2

export function quadrant(n: Pick<TreeNode, 'impact' | 'effort'>): Quadrant | null {
  if (impactEffortScore(n) == null) return null
  const highImpact = n.impact! >= MIDPOINT
  const lowEffort = n.effort! <= MIDPOINT
  if (highImpact) return lowEffort ? 'Quick win' : 'Big bet'
  return lowEffort ? 'Fill-in' : 'Money pit'
}

/** Number used to rank a node under `method`; null if it isn't on that method or isn't fully scored. */
export function methodScore(n: MethodFields, method: ScoringMethod): number | null {
  if (effectiveMethod(n) !== method) return null
  if (method === 'rice') return riceScore(n)
  if (method === 'impact_effort') return impactEffortScore(n)
  return null
}

export function assessmentCount(n: Pick<TreeNode, 'assessment'>): number {
  const a = parseAssessment(n.assessment)
  return a ? ASSESSMENT_FACTORS.filter((f) => a[f].confidence !== null).length : 0
}

/** Has this node been scored under its chosen method? */
export function isScored(n: MethodFields & Pick<TreeNode, 'assessment'>): boolean {
  const method = effectiveMethod(n)
  return method === 'assessment' ? assessmentCount(n) > 0 : methodScore(n, method) != null
}
