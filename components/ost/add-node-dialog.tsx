'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TYPE_LABEL, type NodeType } from '@/lib/ost'
import { canAddChild } from '@/lib/tree'
import { useWs } from './context'
import { TypeTag } from './primitives'

const PLACEHOLDER: Record<NodeType, string> = {
  goal: '',
  outcome: 'Increase weekly active buyers by 10%',
  question: 'How might we make returning to a previous purchase effortless?',
  opportunity: "I can't find items I bought before",
  solution: 'One-tap "buy again" shelf on the home screen',
  experiment: 'Fake-door test of the shelf with 5% of users',
}

export function AddNodeDialog() {
  const { addTarget, closeAdd, createNode, isAdmin, select } = useWs()
  const parent = addTarget?.parent
  const options = parent ? canAddChild(parent.type, isAdmin) : []

  return (
    <Dialog open={!!parent} onOpenChange={(open) => !open && closeAdd()}>
      <DialogContent className="sm:max-w-md">
        {parent && (
          <AddForm
            key={parent.id}
            parentTitle={parent.title}
            options={options}
            onSubmit={async (type, title) => {
              const created = await createNode({ parentId: parent.id, type, title })
              if (created) {
                closeAdd()
                select(created.id)
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddForm({
  parentTitle,
  options,
  onSubmit,
}: {
  parentTitle: string
  options: NodeType[]
  onSubmit: (type: NodeType, title: string) => Promise<void>
}) {
  const [type, setType] = useState<NodeType | undefined>(options[0])
  const [pending, setPending] = useState(false)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault()
        const title = String(new FormData(e.currentTarget).get('title') ?? '').trim()
        if (!type || !title) return
        setPending(true)
        await onSubmit(type, title)
        setPending(false)
      }}
    >
      <DialogHeader>
        <DialogTitle>Add to the tree</DialogTitle>
        <DialogDescription className="text-pretty">
          Under <span className="font-medium text-foreground">{parentTitle}</span>
        </DialogDescription>
      </DialogHeader>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {"Nothing can be added here. Outcomes are managed by the workspace admin."}
        </p>
      ) : (
        <>
          {options.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Type</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((t) => (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={type === t}
                      onChange={() => setType(t)}
                      className="sr-only"
                    />
                    <TypeTag type={t} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-node-title">{type ? TYPE_LABEL[type] : 'Title'}</Label>
            <Input
              id="new-node-title"
              name="title"
              required
              maxLength={200}
              autoFocus
              placeholder={type ? PLACEHOLDER[type] : ''}
            />
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pending || options.length === 0}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Add {type ? TYPE_LABEL[type].toLowerCase() : ''}
        </Button>
      </DialogFooter>
    </form>
  )
}
