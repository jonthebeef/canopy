import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb, schema } from '@/lib/db'

// D1 bindings are only available per request on Cloudflare, so the auth
// instance is created from the request's database binding.
export async function getAuth() {
  const db = await getDb()
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
            ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
            ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
            ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
            ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
          ]
        : []),
      ...(process.env.NODE_ENV === 'production'
        ? [
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

export async function requireUser() {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')
  return session.user
}
