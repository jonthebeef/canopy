import { handle } from '@/lib/api'
import { createEvidence, createEvidenceSchema } from '@/lib/evidence'

export async function POST(req: Request, ctx: RouteContext<'/api/w/[id]/evidence'>) {
  const { id } = await ctx.params
  return handle(async () => createEvidence(id, createEvidenceSchema.parse(await req.json())))
}
