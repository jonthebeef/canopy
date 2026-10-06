import { handle } from '@/lib/api'
import { createNode, createNodeSchema } from '@/lib/nodes'

export async function POST(req: Request, ctx: RouteContext<'/api/w/[id]/nodes'>) {
  const { id } = await ctx.params
  return handle(async () => createNode(id, createNodeSchema.parse(await req.json())))
}
