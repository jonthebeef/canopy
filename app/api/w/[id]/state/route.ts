import { handle } from '@/lib/api'
import { loadWorkspaceState } from '@/lib/workspace'

export async function GET(_req: Request, ctx: RouteContext<'/api/w/[id]/state'>) {
  const { id } = await ctx.params
  return handle(() => loadWorkspaceState(id))
}
