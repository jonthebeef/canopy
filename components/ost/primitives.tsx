'use client'

import { useState, type ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CONFIDENCE_STEPS,
  EFFORT_MIN,
  formatScore,
  RICE_FIELDS,
  RICE_MAX,
  STATUS_LABEL,
  TYPE_LABEL,
  type NodeStatus,
  type NodeType,
  type RiceKey,
  type TreeNode,
} from '@/lib/ost'

export const TYPE_STYLE: Record<NodeType, string> = {
  goal: 'bg-foreground text-background',
  outcome: 'bg-primary text-primary-foreground',
  question: 'bg-sky-100 text-sky-900',
  opportunity: 'bg-secondary text-secondary-foreground',
  solution: 'bg-score/25 text-score-foreground',
  experiment: 'bg-muted text-muted-foreground',
}

export function TypeTag({ type, className }: { type: NodeType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider',
        TYPE_STYLE[type],
        className,
      )}
    >
      {TYPE_LABEL[type]}
    </span>
  )
}

const STATUS_DOT: Record<NodeStatus, string> = {
  exploring: 'border border-muted-foreground bg-transparent',
  validated: 'bg-primary',
  in_progress: 'bg-score',
  done: 'bg-foreground',
  parked: 'bg-border',
}

export function StatusLabel({ status, className }: { status: NodeStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className={cn('size-2 rounded-full', STATUS_DOT[status])} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ScoreChip({ score, className }: { score: number | null; className?: string }) {
  if (score == null) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-score px-1.5 py-0.5 font-mono text-xs font-semibold text-score-foreground tabular-nums',
        className,
      )}
      title="RICE score"
    >
      <span className="text-[10px] font-medium opacity-70">RICE</span>
      {formatScore(score)}
    </span>
  )
}

export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        {...props}
        className="h-8 w-full appearance-none rounded-md border border-input bg-card py-1 pr-7 pl-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}

/**
 * Text field that keeps a local draft while focused so live-sync polling can't
 * clobber what the user is typing. Commits on blur or Enter.
 */
export function CommitText({
  value,
  onCommit,
  multiline,
  className,
  ...props
}: {
  value: string
  onCommit: (value: string) => void
  multiline?: boolean
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue'>) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value

  const commit = () => {
    if (draft != null && draft !== value) onCommit(draft)
    setDraft(null)
  }

  const shared = {
    value: shown,
    onFocus: () => setDraft(value),
    onBlur: commit,
    className: cn(
      'w-full rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/30 disabled:hover:border-transparent',
      className,
    ),
  }

  if (multiline) {
    return (
      <textarea
        {...shared}
        aria-label={props['aria-label']}
        placeholder={props.placeholder}
        disabled={props.disabled}
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        className={cn(shared.className, 'resize-y leading-relaxed')}
      />
    )
  }

  return (
    <input
      {...props}
      {...shared}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

const DECIMAL = /^\d*(?:[.,]\d*)?$/

/** Free-text decimal entry (accepts "7", "7.5", "7,5", ".5"); clamps to range on commit. */
export function CommitNumber({
  value,
  onCommit,
  min,
  max,
  className,
  ...props
}: {
  value: number | null
  onCommit: (value: number | null) => void
  min?: number
  max?: number
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step' | 'type'>) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const shown = draft ?? (value == null ? '' : String(value))

  const commit = () => {
    if (draft == null) return
    setDraft(null)
    const trimmed = draft.trim()
    if (trimmed === '') {
      if (value !== null) onCommit(null)
      return
    }
    let num = Number(trimmed.replace(',', '.'))
    if (!DECIMAL.test(trimmed) || !Number.isFinite(num) || trimmed === '.' || trimmed === ',') {
      setInvalid(true)
      return
    }
    if (min != null) num = Math.max(min, num)
    if (max != null) num = Math.min(max, num)
    num = Math.round(num * 100) / 100
    if (num !== value) onCommit(num)
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      aria-invalid={invalid || undefined}
      placeholder={props.placeholder ?? '—'}
      onFocus={() => {
        setInvalid(false)
        setDraft(value == null ? '' : String(value))
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      className={cn(
        'h-8 w-full rounded-md border border-input bg-card px-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
    />
  )
}

/** One input per RICE dimension — shared by the table and the detail panel. */
export function RiceInput({
  field,
  node,
  disabled,
  onCommit,
  className,
}: {
  field: RiceKey
  node: TreeNode
  disabled?: boolean
  onCommit: (value: number | null) => void
  className?: string
}) {
  const label = RICE_FIELDS.find((f) => f.key === field)!.label
  if (field === 'confidence') {
    const current = node.confidence
    const offGrid = current != null && !CONFIDENCE_STEPS.includes(current)
    return (
      <NativeSelect
        aria-label={`${label} percent`}
        value={current == null ? '' : String(current)}
        disabled={disabled}
        onChange={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
        className={cn('font-mono tabular-nums', className)}
      >
        <option value="">—</option>
        {offGrid && <option value={current}>{current}%</option>}
        {CONFIDENCE_STEPS.map((v) => (
          <option key={v} value={v}>
            {v}%
          </option>
        ))}
      </NativeSelect>
    )
  }
  return (
    <CommitNumber
      aria-label={`${label}, 0 to ${RICE_MAX}`}
      value={node[field]}
      min={field === 'effort' ? EFFORT_MIN : 0}
      max={RICE_MAX}
      disabled={disabled}
      onCommit={onCommit}
      className={className}
    />
  )
}
