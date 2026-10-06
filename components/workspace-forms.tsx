import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function submitJson(url: string, body: Record<string, FormDataEntryValue>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json() as { id?: string; error?: string }
  if (!response.ok || !result.id) throw new Error(result.error ?? 'Something went wrong')
  return result.id
}

export function CreateWorkspaceForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      const id = await submitJson('/api/workspaces', {
        name: form.get('name') ?? '',
        product: form.get('product') ?? '',
        goal: form.get('goal') ?? '',
      })
      window.location.assign(`/w/${id}/setup`)
    } catch (cause) {
      setPending(false)
      setError(cause instanceof Error ? cause.message : 'Could not create workspace')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input id="ws-name" name="name" placeholder="Checkout squad" required maxLength={80} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-product">Product</Label>
        <Input id="ws-product" name="product" placeholder="Mobile checkout" maxLength={120} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ws-goal">Business goal</Label>
        <Input id="ws-goal" name="goal" placeholder="Grow repeat purchase revenue 15% this year" required maxLength={200} />
        <p className="text-xs text-muted-foreground">This becomes the root of your tree.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Create workspace
      </Button>
    </form>
  )
}

export function JoinWorkspaceForm({ defaultCode }: { defaultCode?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      const id = await submitJson('/api/workspaces/join', { code: form.get('code') ?? '' })
      window.location.assign(`/w/${id}`)
    } catch (cause) {
      setPending(false)
      setError(cause instanceof Error ? cause.message : 'Could not join workspace')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-code">Invite link or code</Label>
        <Input id="invite-code" name="code" defaultValue={defaultCode} required />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Join workspace
      </Button>
    </form>
  )
}
