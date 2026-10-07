const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Cookie-authenticated mutations must come from the same browser origin. */
export function hasTrustedMutationOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true
  return request.headers.get('origin') === new URL(request.url).origin
}
