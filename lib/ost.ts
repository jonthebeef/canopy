export const NODE_TYPES = [
  'goal',
  'outcome',
  'question',
  'opportunity',
  'solution',
  'experiment',
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const NODE_STATUSES = [
  'exploring',
  'validated',
  'in_progress',
  'done',
  'parked',
] as const
export type NodeStatus = (typeof NODE_STATUSES)[number]

export const TYPE_LABEL: Record<NodeType, string> = {
  goal: 'Goal',
  outcome: 'Outcome',
  question: 'How might we',
  opportunity: 'Opportunity',
  solution: 'Solution',
  experiment: 'Experiment',
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  exploring: 'Exploring',
  validated: 'Validated',
  in_progress: 'In progress',
  done: 'Done',
  parked: 'Parked',
}

/** Which node types may sit directly under each parent type. */
export const ALLOWED_CHILDREN: Record<NodeType, NodeType[]> = {
  goal: ['outcome'],
  outcome: ['question', 'opportunity'],
  question: ['question', 'opportunity', 'solution', 'experiment'],
  opportunity: ['question', 'opportunity', 'solution'],
  solution: ['question', 'experiment'],
  experiment: [],
}

export type RiceKey = 'reach' | 'impact' | 'confidence' | 'effort'

/** Reach, Impact and Effort are scored 0–10 (decimals allowed); Confidence is a % in 10% steps. */
export const RICE_MAX = 10
export const EFFORT_MIN = 0.1
export const CONFIDENCE_STEPS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]

export const RICE_FIELDS: { key: RiceKey; label: string; hint: string }[] = [
  { key: 'reach', label: 'Reach', hint: '0–10' },
  { key: 'impact', label: 'Impact', hint: '0–10' },
  { key: 'confidence', label: 'Confidence', hint: '10% steps' },
  { key: 'effort', label: 'Effort', hint: '0.1–10' },
]

export const EVIDENCE_KINDS = ['insight', 'metric', 'quote', 'research', 'other'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  insight: 'User insight',
  metric: 'Metric',
  quote: 'Quote',
  research: 'Research',
  other: 'Other',
}

export type Evidence = {
  id: string
  nodeId: string
  kind: EvidenceKind
  summary: string
  value: string
  detail: string
  source: string
  archivedAt: number | null
  archivedBy: string | null
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

export type TreeNode = {
  id: string
  workspaceId: string
  parentId: string | null
  type: NodeType
  title: string
  description: string
  status: NodeStatus
  reach: number | null
  impact: number | null
  confidence: number | null
  effort: number | null
  sortOrder: number
  archivedAt: number | null
  archivedBy: string | null
  archiveReason: string | null
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

export type Member = {
  userId: string
  name: string
  email: string
  role: 'admin' | 'member'
  lastSeenAt: number | null
}

export type WorkspaceState = {
  workspace: {
    id: string
    name: string
    product: string
    /** Only sent to admins; contributors can't see or share the invite link. */
    inviteCode: string | null
  }
  me: { id: string; role: 'admin' | 'member' }
  members: Member[]
  nodes: TreeNode[]
  evidence: Evidence[]
  revision: number
}

export type ActivityEvent = {
  id: number
  nodeId: string | null
  actorId: string
  actorName: string
  action: string
  summary: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  reason: string | null
  createdAt: number
}

/**
 * RICE inputs saved before the 0–10 scale (e.g. Reach 2000) would dominate any
 * ranking, so they're flagged for re-scoring instead of being counted.
 */
export function outOfScaleRice(n: Pick<TreeNode, RiceKey>): RiceKey[] {
  const bad: RiceKey[] = []
  for (const key of ['reach', 'impact', 'effort'] as const) {
    const v = n[key]
    if (v != null && (v < 0 || v > RICE_MAX)) bad.push(key)
  }
  if (n.confidence != null && (n.confidence < 0 || n.confidence > 100)) bad.push('confidence')
  return bad
}

/** RICE = Reach × Impact × Confidence(%) ÷ Effort. Null until all four are set and in scale. */
export function riceScore(n: Pick<TreeNode, 'reach' | 'impact' | 'confidence' | 'effort'>) {
  const { reach, impact, confidence, effort } = n
  if (reach == null || impact == null || confidence == null || effort == null) return null
  if (effort <= 0) return null
  if (outOfScaleRice(n).length > 0) return null
  return (reach * impact * (confidence / 100)) / effort
}

export function formatScore(score: number | null) {
  if (score == null) return '—'
  if (score >= 100) return Math.round(score).toLocaleString()
  if (score >= 1) return score.toFixed(1)
  return score.toFixed(2)
}

export const ONLINE_WINDOW_MS = 20_000

export function isOnline(lastSeenAt: number | null, now = Date.now()) {
  return lastSeenAt != null && now - lastSeenAt < ONLINE_WINDOW_MS
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** Ordered list of ancestors (root first) for a node. */
export function ancestry(nodeId: string, byId: Map<string, TreeNode>) {
  const chain: TreeNode[] = []
  let current = byId.get(nodeId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId)
    const parent = byId.get(current.parentId)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}

/** A node is effectively hidden if it or any ancestor is archived. */
export function isEffectivelyArchived(nodeId: string, byId: Map<string, TreeNode>) {
  const self = byId.get(nodeId)
  if (!self) return true
  if (self.archivedAt) return true
  return ancestry(nodeId, byId).some((a) => a.archivedAt)
}
