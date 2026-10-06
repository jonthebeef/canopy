import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb, schema } from '@/lib/db'

// D1 bindings are only available per request on Cloudflare, so the auth
// instance is created from the request's database binding.
// The v0 sandbox does not always expose its preview hostnames as env vars, so in
// development we also trust the exact host this request was addressed to. That is
// a same-origin rule: a page served from another site still fails the check.
async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return []
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return [`${proto}://${host}`]
}

// Fail loudly instead of running production with a default secret or an empty
// trusted-origin list (which shows up as a confusing "Invalid origin" on sign-in).
function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return
  const missing = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'].filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(' and ')}. Set them on the Cloudflare Worker (wrangler secret put / dashboard) before deploying.`,
    )
  }
}

export async function getAuth() {
  // Reading request headers first opts callers out of static prerendering, so the
  // config check runs per request on the deployed Worker, never during `next build`.
  await headers()
  if (process.env.NEXT_PHASE !== 'phase-production-build') assertProductionConfig()
  const db = await getDb()
  const devOrigins = process.env.NODE_ENV === 'development' ? await requestOrigin() : []
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
      enabled: process.env.NODE_ENV === 'production',
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    baseURL:
      process.env.BETTER_AUTH_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.V0_RUNTIME_URL),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    trustedOrigins: [
      ...(process.env.NODE_ENV === 'development'
        ? [
            'http://localhost:3000',
            ...devOrigins,
            ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
            ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
            ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
            ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
          ]
        : []),
      ...(process.env.NODE_ENV === 'production'
        ? [
            ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
            ...(process.env.VERCEL_URL
              ? [`https://${process.env.VERCEL_URL}`]
              : []),
            ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
              ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
              : []),
          ]
        : []),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    ...(process.env.NODE_ENV === 'development'
      ? {
          advanced: {
            // Required by the cross-site v0 preview iframe. Without these
            // attributes, login succeeds but the next request appears signed out.
            defaultCookieAttributes: {
              sameSite: 'none' as const,
              secure: true,
            },
          },
        }
      : {
          advanced: {
            // Cloudflare sets this to the real client IP; rate limits key off it.
            ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
          },
        }),
  })
}

export async function getSession() {
  const auth = await getAuth()
  return auth.api.getSession({ headers: await headers() })
}

export async function requireUser(next?: string) {
  const session = await getSession()
  if (!session?.user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in')
  return session.user
}
