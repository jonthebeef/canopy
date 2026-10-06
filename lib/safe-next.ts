/** Only allow same-site relative paths, so `?next=` can't send users to another site. */
export function safeNextPath(next: unknown, fallback = '/workspaces') {
  if (typeof next !== 'string') return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback
  return next
}
