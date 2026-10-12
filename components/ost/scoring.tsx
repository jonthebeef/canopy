'use client'

import {
  RICE_FIELDS,
  formatScore,
  outOfScaleRice,
  riceScore,
  type TreeNode,
} from '@/lib/ost'
import {
  ASSESSMENT_CONFIDENCES,
  ASSESSMENT_FACTORS,
  CONFIDENCE_LABEL,
  FACTOR_LABEL,
  METHOD_LABEL,
  NOTE_MAX,
  SCORING_METHODS,
  effectiveMethod,
  emptyAssessment,
  impactEffortScore,
  parseAssessment,
  quadrant,
  serializeAssessment,
  type AssessmentConfidence,
  type AssessmentFactor,
} from '@/lib/scoring'
import { cn } from '@/lib/utils'
import type { EditableFields } from '@/lib/use-workspace'
import { CommitText, NativeSelect, RiceInput, ScoreChip } from './primitives'

type Update = (fields: EditableFields) => void

const DOT: Record<AssessmentConfidence | 'none', string> = {
  strong: 'bg-primary',
  weak: 'bg-score',
  unknown: 'bg-muted-foreground/50',
  none: 'border border-muted-foreground/60 bg-transparent',
}

const FACTOR_TINT: Record<AssessmentFactor, string> = {
  size: 'border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/20',
  market: 'border-l-green-400 bg-green-50/60 dark:bg-green-950/20',
  company: 'border-l-orange-400 bg-orange-50/60 dark:bg-orange-950/20',
  customer: 'border-l-yellow-400 bg-yellow-50/60 dark:bg-yellow-950/20',
}

/** Compact, method-aware score summary for the table and tree cards. Renders nothing if unscored. */
export function MethodChip({ node, className }: { node: TreeNode; className?: string }) {
  const method = effectiveMethod(node)

  if (method === 'rice') return <ScoreChip score={riceScore(node)} className={className} />

  if (method === 'impact_effort') {
    if (impactEffortScore(node) == null) return null
    const q = quadrant(node)
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-sm bg-score px-1.5 py-0.5 font-mono text-xs font-semibold text-score-foreground tabular-nums',
          className,
        )}
        title={`Impact ${node.impact}, effort ${node.effort}${q ? `: ${q}` : ''}`}
      >
        <span className="text-[10px] font-medium opacity-70">I/E</span>
        {formatScore(impactEffortScore(node))}
        {q && <span className="font-sans text-[10px] font-medium opacity-80">{q}</span>}
      </span>
    )
  }

  const assessment = parseAssessment(node.assessment)
  if (!assessment || ASSESSMENT_FACTORS.every((f) => assessment[f].confidence === null)) return null
  const summary = ASSESSMENT_FACTORS.map(
    (f) => `${FACTOR_LABEL[f]}: ${assessment[f].confidence ? CONFIDENCE_LABEL[assessment[f].confidence!] : 'not rated'}`,
  ).join('. ')
  return (
    <span
      role="img"
      aria-label={`Assessment. ${summary}`}
      title={summary}
      className={cn('inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-1', className)}
    >
      {ASSESSMENT_FACTORS.map((f) => (
        <span
          key={f}
          className={cn('size-2 rounded-full', DOT[assessment[f].confidence ?? 'none'])}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

/** Tabs that choose how this node is scored, with the editor for the chosen method. */
export function ScoringSection({
  node,
  locked,
  update,
}: {
  node: TreeNode
  locked: boolean
  update: Update
}) {
  const method = effectiveMethod(node)
  // An unsaved method is inferred from the data. Save it with the first edit so
  // clearing a value can't flip the panel to another method mid-edit.
  const save: Update = (fields) => update(node.scoringMethod ? fields : { scoringMethod: method, ...fields })

  return (
    <section aria-labelledby="scoring-heading" className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="scoring-heading" className="text-sm font-semibold">
          Scoring <span className="font-normal text-muted-foreground">(optional)</span>
        </h3>
        <MethodChip node={node} />
      </div>
      <div role="tablist" aria-label="Scoring method" className="flex rounded-md border bg-muted p-0.5">
        {SCORING_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`scoring-tab-${m}`}
            aria-selected={method === m}
            aria-controls="scoring-panel"
            tabIndex={method === m ? 0 : -1}
            disabled={locked}
            onClick={() => update({ scoringMethod: m })}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
              if (!step) return
              e.preventDefault()
              const next = SCORING_METHODS[(SCORING_METHODS.indexOf(m) + step + SCORING_METHODS.length) % SCORING_METHODS.length]
              update({ scoringMethod: next })
              document.getElementById(`scoring-tab-${next}`)?.focus()
            }}
            className={cn(
              'h-7 flex-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors disabled:opacity-60',
              method === m && 'bg-card text-foreground shadow-sm',
            )}
          >
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      <div id="scoring-panel" role="tabpanel" aria-labelledby={`scoring-tab-${method}`} className="flex flex-col gap-3">
        {method === 'rice' && <RicePanel node={node} locked={locked} update={save} />}
        {method === 'impact_effort' && <ImpactEffortPanel node={node} locked={locked} update={save} />}
        {method === 'assessment' && <AssessmentPanel node={node} locked={locked} update={save} />}
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-1 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{hint}</span>
      </span>
      {children}
    </div>
  )
}

function RicePanel({ node, locked, update }: { node: TreeNode; locked: boolean; update: Update }) {
  const score = riceScore(node)
  const outOfScale = outOfScaleRice(node)
  return (
    <>
      {outOfScale.length > 0 && (
        <p role="status" className="rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed text-foreground">
          {outOfScale.map((k) => RICE_FIELDS.find((f) => f.key === k)!.label).join(', ')}{' '}
          {outOfScale.length === 1 ? 'was' : 'were'} scored on the old scale. Re-enter{' '}
          {outOfScale.length === 1 ? 'it' : 'them'} on the 0–10 scale to include this item in the RICE ranking.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {RICE_FIELDS.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>
            <RiceInput field={key} node={node} disabled={locked} onCommit={(v) => update({ [key]: v })} />
          </Field>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        (Reach × Impact × Confidence) ÷ Effort
        {score != null && ` = (${node.reach} × ${node.impact} × ${node.confidence}%) ÷ ${node.effort}`}
        {score == null && outOfScale.length === 0 && ' · fill all four to score'}
      </p>
    </>
  )
}

function ImpactEffortPanel({ node, locked, update }: { node: TreeNode; locked: boolean; update: Update }) {
  const q = quadrant(node)
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Impact" hint="0–10">
          <RiceInput field="impact" node={node} disabled={locked} onCommit={(v) => update({ impact: v })} />
        </Field>
        <Field label="Effort" hint="0.1–10">
          <RiceInput field="effort" node={node} disabled={locked} onCommit={(v) => update({ effort: v })} />
        </Field>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {q ? (
          <>
            <span className="font-medium text-foreground">{q}</span>: impact ÷ effort ={' '}
            {formatScore(impactEffortScore(node))}
          </>
        ) : (
          'Set impact and effort to place this on the grid.'
        )}{' '}
        Impact and effort are shared with RICE, so switching tabs keeps the numbers.
      </p>
    </>
  )
}

function AssessmentPanel({ node, locked, update }: { node: TreeNode; locked: boolean; update: Update }) {
  const assessment = parseAssessment(node.assessment) ?? emptyAssessment()

  const change = (factor: AssessmentFactor, patch: Partial<(typeof assessment)[AssessmentFactor]>) => {
    const next = { ...assessment, [factor]: { ...assessment[factor], ...patch } }
    update({ assessment: serializeAssessment(next) })
  }

  return (
    <div className="flex flex-col gap-2">
      {ASSESSMENT_FACTORS.map((factor) => {
        const { note, confidence } = assessment[factor]
        return (
          <div key={factor} className={cn('flex flex-col gap-1 rounded-md border border-l-4 p-2', FACTOR_TINT[factor])}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide uppercase">{FACTOR_LABEL[factor]}</span>
              <NativeSelect
                aria-label={`${FACTOR_LABEL[factor]} evidence`}
                value={confidence ?? ''}
                disabled={locked}
                onChange={(e) =>
                  change(factor, { confidence: e.target.value === '' ? null : (e.target.value as AssessmentConfidence) })
                }
                className="w-36"
              >
                <option value="">Not rated</option>
                {ASSESSMENT_CONFIDENCES.map((c) => (
                  <option key={c} value={c}>
                    {CONFIDENCE_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <CommitText
              multiline
              aria-label={`${FACTOR_LABEL[factor]} notes`}
              placeholder="What do we know, and how do we know it?"
              maxLength={NOTE_MAX}
              value={note}
              disabled={locked}
              onCommit={(v) => change(factor, { note: v.slice(0, NOTE_MAX) })}
              className="text-sm"
            />
          </div>
        )
      })}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Assessments aren't ranked. Rate each factor by how strong the evidence is, not how big the opportunity is.
      </p>
    </div>
  )
}
