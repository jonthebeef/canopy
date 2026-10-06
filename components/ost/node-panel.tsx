'use client'

import { useState } from 'react'
import { Archive, ArchiveRestore, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ancestry,
  isEffectivelyArchived,
  NODE_STATUSES,
  RICE_FIELDS,
  riceScore,
  STATUS_LABEL,
  TYPE_LABEL,
  type NodeStatus,
  type TreeNode,
} from '@/lib/ost'
import { canAddChild, descendantIds, validNewParents } from '@/lib/tree'
import { ActivityList } from './activity-list'
import { useWs } from './context'
import { EvidenceSection } from './evidence-section'
import { CommitText, NativeSelect, RiceInput, ScoreChip, TypeTag } from './primitives'

export function NodePanel() {
  const { selectedId, byId, select } = useWs()
  const node = selectedId ? byId.get(selectedId) : undefined
  if (!node) return null

  return (
    <aside
      aria-label={`${TYPE_LABEL[node.type]} details`}
      className="fixed inset-0 z-40 flex flex-col bg-card md:static md:z-auto md:w-96 md:shrink-0 md:border-l"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <TypeTag type={node.type} />
        <Button variant="ghost" size="icon-sm" onClick={() => select(null)} aria-label="Close details">
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NodeDetails key={node.id} node={node} />
      </div>
    </aside>
  )
}

function NodeDetails({ node }: { node: TreeNode }) {
  const { state, byId, patchNode, isAdmin, memberName, openAdd, select } = useWs()
  const [archiveOpen, setArchiveOpen] = useState(false)

  const locked = !isAdmin && (node.type === 'goal' || node.type === 'outcome')
  const hiddenByAncestor = !node.archivedAt && isEffectivelyArchived(node.id, byId)
  const path = ancestry(node.id, byId)
  const score = riceScore(node)
  const parents = validNewParents(node, state.nodes)
  const childTypes = canAddChild(node.type, isAdmin)
  const update = (fields: Parameters<typeof patchNode>[1] & { op: 'update' }) => patchNode(node.id, fields)

  return (
    <div className="flex flex-col gap-6 p-4">
      {path.length > 0 && (
        <nav aria-label="Location in tree">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {path.map((p) => (
              <li key={p.id} className="flex items-center gap-1 after:content-['/'] last:after:content-none">
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  className="max-w-40 truncate hover:text-foreground hover:underline"
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {(node.archivedAt || hiddenByAncestor) && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted p-3 text-sm">
          <p className="font-medium">
            {node.archivedAt ? 'Archived' : 'Hidden because a parent is archived'}
          </p>
          {node.archivedAt && (
            <p className="leading-relaxed text-muted-foreground">
              By {memberName(node.archivedBy ?? '')} on {new Date(node.archivedAt).toLocaleDateString()}
              {node.archiveReason ? ` — "${node.archiveReason}"` : ''}
            </p>
          )}
        </div>
      )}

      <div className="-mx-2 flex flex-col gap-1">
        <CommitText
          aria-label="Title"
          value={node.title}
          disabled={locked}
          onCommit={(title) => title.trim() && update({ op: 'update', fields: { title: title.trim() } })}
          className="text-lg font-semibold"
        />
        <CommitText
          multiline
          aria-label="Description"
          placeholder={locked ? '' : 'Add notes or context…'}
          value={node.description}
          disabled={locked}
          onCommit={(description) => update({ op: 'update', fields: { description } })}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="node-status">Status</Label>
        <NativeSelect
          id="node-status"
          value={node.status}
          disabled={locked}
          onChange={(e) => update({ op: 'update', fields: { status: e.target.value as NodeStatus } })}
        >
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <section aria-labelledby="rice-heading" className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <h3 id="rice-heading" className="text-sm font-semibold">
            RICE score <span className="font-normal text-muted-foreground">(optional)</span>
          </h3>
          {score != null ? (
            <ScoreChip score={score} />
          ) : (
            <span className="text-xs text-muted-foreground">Fill all four to score</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {RICE_FIELDS.map(({ key, label, hint }) => (
            <RiceField key={key} label={label} hint={hint}>
              <RiceInput
                field={key}
                node={node}
                disabled={locked}
                onCommit={(v) => update({ op: 'update', fields: { [key]: v } })}
              />
            </RiceField>
          ))}
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          (Reach × Impact × Confidence) ÷ Effort
          {score != null &&
            ` = (${node.reach} × ${node.impact} × ${node.confidence}%) ÷ ${node.effort}`}
        </p>
      </section>

      <EvidenceSection node={node} />

      {!locked && node.parentId && parents.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="node-parent">Sits under</Label>
          <NativeSelect
            id="node-parent"
            value={node.parentId}
            onChange={(e) => patchNode(node.id, { op: 'move', parentId: e.target.value })}
          >
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {TYPE_LABEL[p.type]}: {p.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {childTypes.length > 0 && !node.archivedAt && (
          <Button variant="outline" size="sm" onClick={() => openAdd(node)}>
            <Plus aria-hidden="true" />
            Add {childTypes.map((t) => TYPE_LABEL[t].toLowerCase()).join(' / ')}
          </Button>
        )}
        {!locked && node.type !== 'goal' && (
          node.archivedAt ? (
            <Button variant="outline" size="sm" onClick={() => patchNode(node.id, { op: 'restore' })}>
              <ArchiveRestore aria-hidden="true" />
              Restore
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
              <Archive aria-hidden="true" />
              Archive
            </Button>
          )
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Added by {memberName(node.createdBy)} · {new Date(node.createdAt).toLocaleDateString()}
        <br />
        Last edited by {memberName(node.updatedBy)} · {new Date(node.updatedAt).toLocaleString()}
      </p>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2 border-t pt-4">
        <h3 id="history-heading" className="text-sm font-semibold">
          History
        </h3>
        <ActivityList workspaceId={state.workspace.id} nodeId={node.id} dense />
      </section>

      <ArchiveDialog
        node={node}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={async (reason) => {
          const ok = await patchNode(node.id, { op: 'archive', reason: reason || undefined })
          if (ok) setArchiveOpen(false)
        }}
      />
    </div>
  )
}

function RiceField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
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

function ArchiveDialog({
  node,
  open,
  onOpenChange,
  onConfirm,
}: {
  node: TreeNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const { state } = useWs()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const affected = [...descendantIds(node.id, state.nodes)].filter(
    (id) => !state.nodes.find((n) => n.id === id)?.archivedAt,
  ).length

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this {TYPE_LABEL[node.type].toLowerCase()}?</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            {"It'll be hidden from the tree and table but kept in the history, and anyone can restore it."}
            {affected > 0 && ` ${affected} item${affected === 1 ? '' : 's'} beneath it will be hidden too.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="archive-reason">Why? (recommended)</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Invalidated in interview round 3 — users already use the reorder email"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true)
              await onConfirm(reason.trim())
              setPending(false)
              setReason('')
            }}
          >
            Archive
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
