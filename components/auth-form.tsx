'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, signUp } from '@/lib/auth-client'
import { safeNextPath } from '@/lib/safe-next'

export function AuthForm({ mode, next }: { mode: 'sign-in' | 'sign-up'; next?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const destination = safeNextPath(next)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    const result =
      mode === 'sign-up'
        ? await signUp.email({ email, password, name: String(form.get('name')) })
        : await signIn.email({ email, password })

    if (result.error) {
      setPending(false)
      setError(
        mode === 'sign-up'
          ? result.error.status === 422 || result.error.status === 400
            ? (result.error.message ?? "We couldn't create that account.")
            : "We couldn't create that account. Try a different email."
          : 'That email and password combination didn’t work.',
      )
      return
    }
    window.location.assign(destination)
  }

  const query = next ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {mode === 'sign-up' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          minLength={8}
          required
        />
        {mode === 'sign-up' && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {mode === 'sign-up' ? 'Create account' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'sign-up' ? (
          <>
            Already have an account?{' '}
            <a href={`/sign-in${query}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </a>
          </>
        ) : (
          <>
            New to Canopy?{' '}
            <a href={`/sign-up${query}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Create an account
            </a>
          </>
        )}
      </p>
    </form>
  )
}
