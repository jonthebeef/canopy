import { describe, expect, it } from 'vitest'
import app from '@/src/worker'
import { hasTrustedMutationOrigin } from '@/src/worker/security'

describe('mutation origin protection', () => {
  it('allows safe requests without an Origin header', () => {
    expect(hasTrustedMutationOrigin(new Request('https://canopy.example/api/workspaces'))).toBe(true)
  })

  it('allows mutations from the request origin', () => {
    const request = new Request('https://canopy.example/api/workspaces', {
      method: 'POST',
      headers: { Origin: 'https://canopy.example' },
    })
    expect(hasTrustedMutationOrigin(request)).toBe(true)
  })

  it('rejects mutations with a missing or different origin', () => {
    expect(hasTrustedMutationOrigin(new Request('https://canopy.example/api/workspaces', {
      method: 'POST',
    }))).toBe(false)
    expect(hasTrustedMutationOrigin(new Request('https://canopy.example/api/workspaces', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    }))).toBe(false)
  })

  it('rejects a cross-site mutation before auth or D1 are invoked', async () => {
    const response = await app.request('https://canopy.example/api/workspaces', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request origin' })
  })
})
