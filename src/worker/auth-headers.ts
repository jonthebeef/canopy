import { splitSetCookieHeader } from 'better-auth/cookies'

type CookieHeaders = Headers & {
  getSetCookie?: () => string[]
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const cookieHeaders = headers as CookieHeaders
  return cookieHeaders.getSetCookie?.() ?? splitSetCookieHeader(headers.get('set-cookie') ?? '')
}
