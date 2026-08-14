import { parseProjectIdParam } from '@/domain'
import { getProjectDetail } from '@/application/project-detail'
import { getAppDeps } from '@/infra/container'
import { handlePortalRequest, NOT_FOUND } from '@/infra/http/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId: raw } = await context.params

  return handlePortalRequest('GET /api/portal/projects/[projectId]', request, async ({ session }) => {
    // Shape validation only. Authorisation is the provider's ownership check
    // below — a well-formed id belonging to another customer still returns 404.
    const projectId = parseProjectIdParam(raw)
    if (projectId === null) return NOT_FOUND

    const result = await getProjectDetail(getAppDeps(), session.customerId, projectId)
    return result.value ?? NOT_FOUND
  })
}
