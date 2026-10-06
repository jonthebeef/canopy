'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { createWorkspace, joinWorkspace } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, null)
  return (
    <form action={action} className="flex flex-col gap-4">
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
        <Input
          id="ws-goal"
          name="goal"
          placeholder="Grow repeat purchase revenue 15% this year"
          required
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">This becomes the root of your tree.</p>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Create workspace
      </Button>
    </form>
  )
}

export function JoinWorkspaceForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(joinWorkspace, null)
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-code">Invite link or code</Label>
        <Input id="invite-code" name="code" defaultValue={defaultCode} required />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Join workspace
      </Button>
    </form>
  )
}
