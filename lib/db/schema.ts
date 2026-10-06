import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)

/* ---------- Better Auth ---------- */

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

/* ---------- Opportunity solution tree ---------- */

export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  product: text('product').notNull().default(''),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at'),
})

export const member = sqliteTable(
  'member',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: timestamp('joined_at'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('member_user_idx').on(t.userId),
  ],
)

export const node = sqliteTable(
  'node',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    type: text('type', {
      enum: ['goal', 'outcome', 'opportunity', 'solution', 'experiment'],
    }).notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', {
      enum: ['exploring', 'validated', 'in_progress', 'done', 'parked'],
    })
      .notNull()
      .default('exploring'),
    reach: real('reach'),
    impact: real('impact'),
    confidence: real('confidence'),
    effort: real('effort'),
    sortOrder: real('sort_order').notNull().default(0),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    archivedBy: text('archived_by'),
    archiveReason: text('archive_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('node_workspace_idx').on(t.workspaceId),
    index('node_parent_idx').on(t.parentId),
  ],
)

export const evidence = sqliteTable(
  'evidence',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    kind: text('kind', {
      enum: ['insight', 'metric', 'quote', 'research', 'other'],
    }).notNull(),
    summary: text('summary').notNull(),
    value: text('value').notNull().default(''),
    detail: text('detail').notNull().default(''),
    source: text('source').notNull().default(''),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    archivedBy: text('archived_by'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('evidence_workspace_idx').on(t.workspaceId),
    index('evidence_node_idx').on(t.nodeId),
  ],
)

export const auditEvent = sqliteTable(
  'audit_event',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    actorId: text('actor_id').notNull(),
    action: text('action', {
      enum: [
        'create',
        'update',
        'move',
        'archive',
        'restore',
        'workspace',
        'member',
      ],
    }).notNull(),
    summary: text('summary').notNull(),
    changes: text('changes', { mode: 'json' }).$type<AuditChanges>(),
    reason: text('reason'),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    index('audit_workspace_idx').on(t.workspaceId, t.id),
    index('audit_node_idx').on(t.nodeId),
  ],
)

export type AuditChanges = Record<
  string,
  { from: unknown; to: unknown }
>

export type NodeRow = typeof node.$inferSelect
export type NodeType = NodeRow['type']
export type NodeStatus = NodeRow['status']
