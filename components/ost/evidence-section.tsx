'use client'

import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, ExternalLink, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { EVIDENCE_KINDS, EVIDENCE_LABEL, type Evidence, type EvidenceKind, type TreeNode } from '@/lib/ost'
import type { EvidenceInput } from '@/lib/use-workspace'
import { useWs } from './context'

const KIND_STYLE: Record<EvidenceKind, string> = {
  insight: 'bg-secondary text-secondary-foreground',
  metric: 'bg-score/25 text-score-foreground',
  quote: 'bg-primary/10 text-primary',
  research: 'bg-muted text-muted-foreground',
  other: 'bg-muted text-muted-foreground',
}

const SUMMARY_PLACEHOLDER: Record<EvidenceKind, string> = {
  insight: 'e.g. Users re-order from past purchases, not search',
  metric: 'e.g. Repeat purchase rate, last 90 days',
  quote: 'e.g. "I never know if my usual size is in stock"',
  research: 'e.g. Diary study round 2 — 8 of 12 participants',
  other: 'Short summary',
}

export function EvidenceSection({ node }: { node: TreeNode }) {
  const { state, showArchived } = useWs()
  const [adding, setAdding] = useState(false)

  const items = state.evidence
    .filter((e) => e.nodeId === node.id && (showArchived || !e.archivedAt))
    .sort((a, b) => b.createdAt - a.createdAt)
  const activeCount = items.filter((e) => !e.archivedAt).length

  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="evidence-heading" className="text-sm font-semibold">
          Evidence{' '}
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
            ({activeCount})
          </span>
        </h3>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            Add evidence
          </Button>
        )}
      </div>

      {adding && <EvidenceForm nodeId={node.id} onDone={() => setAdding(false)} />}

      {items.length === 0 && !adding ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground">
          No evidence yet. Add user insights, metrics or quotes that back this up.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li key={e.id}>
              <EvidenceCard evidence={e} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const { memberName, patchEvidence } = useWs()
  const [editing, setEditing] = useState(false)
  const archived = Boolean(evidence.archivedAt)

  if (editing) {
    return <EvidenceForm nodeId={evidence.nodeId} existing={evidence} onDone={() => setEditing(false)} />
  }

  const link = parseLink(evidence.source)

  return (
    <article
      className={cn(
        'group flex flex-col gap-1.5 rounded-md border bg-background p-3 text-sm',
        archived && 'border-dashed opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider',
            KIND_STYLE[evidence.kind],
          )}
        >
          {EVIDENCE_LABEL[evidence.kind]}
        </span>
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {!archived && (
            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)} aria-label="Edit evidence">
              <Pencil aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => patchEvidence(evidence.id, { op: archived ? 'restore' : 'archive' })}
            aria-label={archived ? 'Restore evidence' : 'Archive evidence'}
          >
            {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {evidence.value && (
        <p className="font-mono text-xl font-semibold leading-tight tabular-nums">{evidence.value}</p>
      )}
      <p className={cn('text-pretty leading-snug', evidence.kind === 'quote' && 'italic')}>{evidence.summary}</p>
      {evidence.detail && (
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{evidence.detail}</p>
      )}

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
        {evidence.source &&
          (link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate underline-offset-2 hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{link.hostname}</span>
            </a>
          ) : (
            <span className="truncate">{evidence.source}</span>
          ))}
        <span>
          {memberName(evidence.createdBy)} · {new Date(evidence.createdAt).toLocaleDateString()}
          {archived && ' · archived'}
        </span>
      </footer>
    </article>
  )
}

function EvidenceForm({
  nodeId,
  existing,
  onDone,
}: {
  nodeId: string
  existing?: Evidence
  onDone: () => void
}) {
  const { createEvidence, patchEvidence } = useWs()
  const [kind, setKind] = useState<EvidenceKind>(existing?.kind ?? 'insight')
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [value, setValue] = useState(existing?.value ?? '')
  const [source, setSource] = useState(existing?.source ?? '')
  const [detail, setDetail] = useState(existing?.detail ?? '')
  const [saving, setSaving] = useState(false)
  const idBase = existing ? `ev-${existing.id}` : `ev-new-${nodeId}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!summary.trim()) return
    setSaving(true)
    const fields: Required<EvidenceInput> = {
      kind,
      summary: summary.trim(),
      value: kind === 'metric' ? value.trim() : '',
      source: source.trim(),
      detail: detail.trim(),
    }
    const ok = existing
      ? await patchEvidence(existing.id, { op: 'update', fields })
      : Boolean(await createEvidence({ nodeId, ...fields }))
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border bg-muted/50 p-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium">Type</legend>
        <div className="flex flex-wrap gap-1">
          {EVIDENCE_KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                'relative cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/30',
                kind === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              <input
                type="radio"
                name={`${idBase}-kind`}
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              {EVIDENCE_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'metric' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idBase}-value`} className="text-xs">
            Value
          </Label>
          <Input
            id={`${idBase}-value`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 18% or 2,400 / week"
            maxLength={60}
            className="font-mono"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-summary`} className="text-xs">
          {kind === 'quote' ? 'Quote' : kind === 'metric' ? 'What it measures' : 'Summary'}
        </Label>
        <Textarea
          id={`${idBase}-summary`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={SUMMARY_PLACEHOLDER[kind]}
          maxLength={300}
          rows={2}
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-source`} className="text-xs">
          Source <span className="font-normal text-muted-foreground">(optional link or reference)</span>
        </Label>
        <Input
          id={`${idBase}-source`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://… or Interview #4, Amplitude"
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-detail`} className="text-xs">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${idBase}-detail`}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={3000}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !summary.trim()}>
          {saving ? 'Saving…' : existing ? 'Save' : 'Add evidence'}
        </Button>
      </div>
    </form>
  )
}

/** Returns a URL only for well-formed http(s) links; anything else renders as plain text. */
function parseLink(source: string) {
  if (!/^https?:\/\//i.test(source)) return null
  try {
    const url = new URL(source)
    return url.hostname ? url : null
  } catch {
    return null
  }
}
