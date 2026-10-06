'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb, schema } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  HttpError,
  auditInsert,
  newId,
  newInviteCode,
  requireAdmin,
} from '@/lib/workspace'

export type ActionState = { error?: string; ok?: boolean } | null

async function requireUserId() {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')
  return session.user.id
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name').max(80),
  product: z.string().trim().max(120),
  goal: z.string().trim().min(1, 'Describe the business goal').max(200),
})

export async function createWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId()
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    product: formData.get('product') ?? '',
    goal: formData.get('goal'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  const db = await getDb()
  const workspaceId = newId()
  const goalId = newId()
  await db.batch([
    db.insert(schema.workspace).values({
      id: workspaceId,
      name: parsed.data.name,
      product: parsed.data.product,
      inviteCode: newInviteCode(),
      createdBy: userId,
    }),
    db.insert(schema.member).values({ workspaceId, userId, role: 'admin' }),
    db.insert(schema.node).values({
      id: goalId,
      workspaceId,
      parentId: null,
      type: 'goal',
      title: parsed.data.goal,
      createdBy: userId,
      updatedBy: userId,
    }),
    auditInsert(db, {
      workspaceId,
      nodeId: goalId,
      actorId: userId,
      action: 'workspace',
      summary: `Created workspace "${parsed.data.name}" with goal "${parsed.data.goal}"`,
    }),
  ])
  redirect(`/w/${workspaceId}/setup`)
}

export async function joinWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId()
  const raw = String(formData.get('code') ?? '').trim()
  const code = raw.split('/').filter(Boolean).pop() ?? ''
  if (!code) return { error: 'Paste an invite code or link' }

  const db = await getDb()
  const ws = await db.query.workspace.findFirst({ where: eq(schema.workspace.inviteCode, code) })
  if (!ws) return { error: "That invite code isn't valid. Ask your PM for a fresh link." }

  const existing = await db.query.member.findFirst({
    where: and(eq(schema.member.workspaceId, ws.id), eq(schema.member.userId, userId)),
  })
  if (!existing) {
    await db.batch([
      db.insert(schema.member).values({ workspaceId: ws.id, userId, role: 'member' }),
      auditInsert(db, {
        workspaceId: ws.id,
        actorId: userId,
        action: 'member',
        summary: 'Joined the workspace',
      }),
    ])
  }
  redirect(`/w/${ws.id}`)
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  product: z.string().trim().max(120),
})

export async function updateWorkspace(
  workspaceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { db, user } = await requireAdmin(workspaceId)
    const parsed = settingsSchema.safeParse({
      name: formData.get('name'),
      product: formData.get('product') ?? '',
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message }
    const current = await db.query.workspace.findFirst({ where: eq(schema.workspace.id, workspaceId) })
    if (!current) return { error: 'Workspace not found' }

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (current.name !== parsed.data.name) changes.name = { from: current.name, to: parsed.data.name }
    if (current.product !== parsed.data.product)
      changes.product = { from: current.product, to: parsed.data.product }
    if (Object.keys(changes).length === 0) return { ok: true }

    await db.batch([
      db.update(schema.workspace).set(parsed.data).where(eq(schema.workspace.id, workspaceId)),
      auditInsert(db, {
        workspaceId,
        actorId: user.id,
        action: 'workspace',
        summary: `Updated workspace ${Object.keys(changes).join(' and ')}`,
        changes,
      }),
    ])
    revalidatePath(`/w/${workspaceId}`, 'layout')
    return { ok: true }
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message }
    throw error
  }
}

// Server actions return errors instead of throwing: in production Next.js replaces
// thrown messages with a generic one, so the user would never see why it failed.
async function asActionState(run: () => Promise<void>): Promise<ActionState> {
  try {
    await run()
    return { ok: true }
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message }
    console.error('[actions] failed', error)
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function regenerateInvite(workspaceId: string): Promise<ActionState> {
  return asActionState(async () => {
    const { db, user } = await requireAdmin(workspaceId)
    await db.batch([
      db
        .update(schema.workspace)
        .set({ inviteCode: newInviteCode() })
        .where(eq(schema.workspace.id, workspaceId)),
      auditInsert(db, {
        workspaceId,
        actorId: user.id,
        action: 'workspace',
        summary: 'Reset the invite link (old links no longer work)',
      }),
    ])
    revalidatePath(`/w/${workspaceId}/setup`)
  })
}

const roleSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['admin', 'member']),
})

export async function setMemberRole(workspaceId: string, userId: string, role: 'admin' | 'member') {
  return asActionState(async () => {
    const parsed = roleSchema.safeParse({ workspaceId, userId, role })
    if (!parsed.success) throw new HttpError(400, 'Invalid role change')
    const input = parsed.data
    const { db, user } = await requireAdmin(input.workspaceId)
    if (input.userId === user.id) throw new HttpError(400, "You can't change your own role")

    const [target] = await db
      .select({ name: schema.user.name, role: schema.member.role })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(eq(schema.member.workspaceId, input.workspaceId), eq(schema.member.userId, input.userId)))
      .limit(1)
    if (!target) throw new HttpError(404, 'That person is not a member of this workspace')
    if (target.role === input.role) return

    await db.batch([
      db
        .update(schema.member)
        .set({ role: input.role })
        .where(and(eq(schema.member.workspaceId, input.workspaceId), eq(schema.member.userId, input.userId))),
      auditInsert(db, {
        workspaceId: input.workspaceId,
        actorId: user.id,
        action: 'member',
        summary: `Made ${target.name} ${input.role === 'admin' ? 'an admin' : 'a contributor'}`,
      }),
    ])
    revalidatePath(`/w/${input.workspaceId}/setup`)
  })
}

export async function signOutRedirect() {
  redirect('/sign-in')
}
