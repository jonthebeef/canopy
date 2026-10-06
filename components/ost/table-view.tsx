'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArchiveRestore, PanelRightOpen, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  NODE_STATUSES,
  NODE_TYPES,
  RICE_FIELDS,
  riceScore,
  STATUS_LABEL,
  TYPE_LABEL,
  type NodeStatus,
  type NodeType,
} from '@/lib/ost'
import { canAddChild, flattenTree, type FlatRow } from '@/lib/tree'
import { cn } from '@/lib/utils'
import { useWs } from './context'
import { CommitText, NativeSelect, RiceInput, ScoreChip, TypeTag } from './primitives'

type SortKey = 'tree' | 'rice' | 'updated' | 'title'

const SORT_LABEL: Record<SortKey, string> = {
  tree: 'Tree order',
  rice: 'RICE score',
  updated: 'Last edited',
  title: 'Title',
}

export function TableView() {
  const { state, showArchived, isAdmin, patchNode, select, selectedId, memberName, openAdd } = useWs()
  const [typeFilter, setTypeFilter] = useState<NodeType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<NodeStatus | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('tree')
  const [desc, setDesc] = useState(true)
  const [query, setQuery] = useState('')
  const [ranked, setRanked] = useState(false)

  const { rows, unscored } = useMemo(() => {
    let list: FlatRow[] = flattenTree(state.nodes, showArchived)
    const q = query.trim().toLowerCase()
    list = list.filter(
      ({ node }) =>
        (typeFilter === 'all' || node.type === typeFilter) &&
        (statusFilter === 'all' || node.status === statusFilter) &&
        (!q || node.title.toLowerCase().includes(q) || node.description.toLowerCase().includes(q)),
    )
    if (ranked) {
      const scoredRows = list.filter((r) => riceScore(r.node) != null)
      scoredRows.sort((a, b) => riceScore(b.node)! - riceScore(a.node)!)
      return { rows: scoredRows, unscored: list.length - scoredRows.length }
    }
    if (sort !== 'tree') {
      const dir = desc ? -1 : 1
      list = [...list].sort((a, b) => {
        if (sort === 'rice') {
          const sa = riceScore(a.node)
          const sb = riceScore(b.node)
          if (sa == null && sb == null) return 0
          if (sa == null) return 1
          if (sb == null) return -1
          return (sa - sb) * dir
        }
        if (sort === 'updated') return (a.node.updatedAt - b.node.updatedAt) * dir
        return a.node.title.localeCompare(b.node.title) * dir
      })
    }
    return { rows: list, unscored: 0 }
  }, [state.nodes, showArchived, typeFilter, statusFilter, sort, desc, query, ranked])

  const flat = !ranked && sort === 'tree'
  const scored = rows.filter((r) => riceScore(r.node) != null).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <div role="radiogroup" aria-label="Table mode" className="flex rounded-md border bg-muted p-0.5">
          {[
            { value: false, label: 'All items' },
            { value: true, label: 'Ranked by RICE' },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={ranked === opt.value}
              onClick={() => setRanked(opt.value)}
              className={cn(
                'h-7 rounded px-3 text-sm font-medium text-muted-foreground transition-colors',
                ranked === opt.value && 'bg-card text-foreground shadow-sm',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="relative flex min-w-48 flex-1 items-center sm:max-w-xs">
          <span className="sr-only">Search items</span>
          <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and notes"
            className="h-8 w-full rounded-md border border-input bg-card pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </label>
        <NativeSelect
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as NodeType | 'all')}
          className="w-40"
        >
          <option value="all">All types</option>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}s
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as NodeStatus | 'all')}
          className="w-40"
        >
          <option value="all">Any status</option>
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        <div className={cn('flex items-center gap-1', ranked && 'hidden')}>
          <NativeSelect
            aria-label="Sort by"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-36"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
          {sort !== 'tree' && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setDesc((d) => !d)}
              aria-label={desc ? 'Sorted descending, switch to ascending' : 'Sorted ascending, switch to descending'}
            >
              {desc ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </Button>
          )}
        </div>
        <p className="ml-auto font-mono text-xs text-muted-foreground">
          {ranked
            ? `${rows.length} ranked${unscored ? ` · ${unscored} unscored hidden` : ''}`
            : `${rows.length} items · ${scored} scored`}
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              {ranked && (
                <th scope="col" className="w-12 py-2 pl-4 font-medium">
                  Rank
                </th>
              )}
              <th scope="col" className="px-3 py-2 font-medium">Item</th>
              <th scope="col" className="w-36 px-2 py-2 font-medium">Status</th>
              <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
                Reach <span className="font-normal opacity-70">/10</span>
              </th>
              <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
                Impact <span className="font-normal opacity-70">/10</span>
              </th>
              <th scope="col" className="w-24 px-2 py-2 font-medium">Confidence</th>
              <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
                Effort <span className="font-normal opacity-70">/10</span>
              </th>
              <th scope="col" className="w-24 px-2 py-2 text-right font-medium">RICE</th>
              <th scope="col" className="w-36 px-2 py-2 font-medium">Last edited</th>
              <th scope="col" className="w-20 px-2 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth, path }, index) => {
              const locked = !isAdmin && (node.type === 'goal' || node.type === 'outcome')
              const update = (fields: Parameters<typeof patchNode>[1] & { op: 'update' }) =>
                patchNode(node.id, fields)
              const score = riceScore(node)
              const childTypes = canAddChild(node.type, isAdmin)
              return (
                <tr
                  key={node.id}
                  className={cn(
                    'border-b align-middle hover:bg-accent/40',
                    node.id === selectedId && 'bg-accent/60',
                    node.archivedAt && 'text-muted-foreground',
                  )}
                >
                  {ranked && (
                    <td className="py-1.5 pl-4 font-mono text-sm font-semibold tabular-nums">{index + 1}</td>
                  )}
                  <td className="py-1.5 pr-2" style={{ paddingLeft: flat ? 12 + depth * 20 : 12 }}>
                    <div className="flex items-center gap-2">
                      <TypeTag type={node.type} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <CommitText
                          aria-label={`${TYPE_LABEL[node.type]} title`}
                          value={node.title}
                          disabled={locked}
                          onCommit={(title) => title.trim() && update({ op: 'update', fields: { title: title.trim() } })}
                          className={cn('-mx-0 truncate', node.archivedAt && 'line-through')}
                        />
                        {!flat && path.length > 0 && (
                          <span className="truncate px-2 text-xs text-muted-foreground">
                            {path.slice(1).join(' / ') || path[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <NativeSelect
                      aria-label="Status"
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
                  </td>
                  {RICE_FIELDS.map(({ key }) => (
                    <td key={key} className="px-2 py-1.5">
                      <RiceInput
                        field={key}
                        node={node}
                        disabled={locked}
                        onCommit={(v) => update({ op: 'update', fields: { [key]: v } })}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    {score != null ? <ScoreChip score={score} /> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="block truncate">{memberName(node.updatedBy)}</span>
                    <time dateTime={new Date(node.updatedAt).toISOString()}>
                      {new Date(node.updatedAt).toLocaleDateString()}
                    </time>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      {node.archivedAt && !locked ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => patchNode(node.id, { op: 'restore' })}
                          aria-label={`Restore ${node.title}`}
                        >
                          <ArchiveRestore aria-hidden="true" />
                        </Button>
                      ) : (
                        childTypes.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openAdd(node)}
                            aria-label={`Add under ${node.title}`}
                          >
                            <Plus aria-hidden="true" />
                          </Button>
                        )
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => select(node.id)}
                        aria-label={`Open details for ${node.title}`}
                      >
                        <PanelRightOpen aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-8 text-center text-sm text-pretty text-muted-foreground">
            {ranked
              ? 'Nothing scored yet. Fill in Reach, Impact, Confidence and Effort on any item to rank it here.'
              : 'No items match these filters.'}
          </p>
        )}
      </div>
    </div>
  )
}
