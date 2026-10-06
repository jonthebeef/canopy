import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from '@/lib/workspace'

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json(await fn(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }
    console.error('[api] unexpected error', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
