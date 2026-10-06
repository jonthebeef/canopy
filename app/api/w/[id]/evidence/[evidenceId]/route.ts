import { handle } from '@/lib/api'
import { patchEvidence, patchEvidenceSchema } from '@/lib/evidence'

export async function PATCH(req: Request, ctx: RouteContext<'/api/w/[id]/evidence/[evidenceId]'>) {
  const { id, evidenceId } = await ctx.params
  return handle(async () => patchEvidence(id, evidenceId, patchEvidenceSchema.parse(await req.json())))
}
