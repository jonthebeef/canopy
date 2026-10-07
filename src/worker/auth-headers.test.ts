import { describe, expect, it } from 'vitest'
import { getSetCookieHeaders } from '@/src/worker/auth-headers'

describe('auth response cookies', () => {
  it('preserves each Better Auth cookie as a separate response header', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'session=abc; Path=/; HttpOnly')
    headers.append('Set-Cookie', 'session_data=xyz; Path=/; HttpOnly')

    expect(getSetCookieHeaders(headers)).toEqual([
      'session=abc; Path=/; HttpOnly',
      'session_data=xyz; Path=/; HttpOnly',
    ])
  })
})
