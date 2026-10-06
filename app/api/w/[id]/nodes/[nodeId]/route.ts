import { handle } from '@/lib/api'
import { patchNode, patchNodeSchema } from '@/lib/nodes'

export async function PATCH(req: Request, ctx: RouteContext<'/api/w/[id]/nodes/[nodeId]'>) {
  const { id, nodeId } = await ctx.params
  return handle(async () => patchNode(id, nodeId, patchNodeSchema.parse(await req.json())))
}
