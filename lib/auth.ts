import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb, schema } from '@/lib/db'

export type AuthEnv = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  CANOPY_PREVIEW?: string
}

function createAuth(env: AuthEnv, baseURL: string, isLocal: boolean) {
  const db = getDb(env.DB)
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    // In-memory limits reset per Worker isolate, so keep counters in D1.
    rateLimit: {
      enabled: !isLocal,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 100,
      customRules: {
        // Session reads are safe and frequent. Avoid a D1 rate-limit write on
        // every client session refresh; mutations remain rate limited below.
        '/get-session': false,
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    baseURL,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    trustedOrigins: [baseURL],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Most API requests only need to verify the current user. Cache the
      // session in a short-lived signed cookie so they avoid a D1 lookup.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
  })
}

type CanopyAuth = ReturnType<typeof createAuth>
let cached: { key: string; auth: CanopyAuth } | undefined

export function getAuth(env: AuthEnv, request: Request): CanopyAuth {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('Missing BETTER_AUTH_SECRET. Add it with `wrangler secret put BETTER_AUTH_SECRET`.')
  }
  const url = new URL(request.url)
  const requestOrigin = url.origin
  const isLocal = url.hostname === 'localhost'
  const isPreview = env.CANOPY_PREVIEW === 'true'
  if (!isLocal && !isPreview && !env.BETTER_AUTH_URL) {
    throw new Error('Missing BETTER_AUTH_URL. Set it to the deployed Worker origin.')
  }
  const baseURL = isLocal || isPreview ? requestOrigin : env.BETTER_AUTH_URL!
  const key = `${baseURL}:${env.BETTER_AUTH_SECRET}`
  if (cached?.key === key) return cached.auth
  const auth = createAuth(env, baseURL, isLocal)
  cached = { key, auth }
  return auth
}
