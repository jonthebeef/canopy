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

export async function getAuth() {
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
      },
    }),
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
      : {}),
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
