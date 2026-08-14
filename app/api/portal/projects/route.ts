import { getProjects } from '@/application/projects'
import { getAppDeps } from '@/infra/container'
import { handlePortalRequest } from '@/infra/http/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handlePortalRequest('GET /api/portal/projects', request, async ({ session }) => {
    const result = await getProjects(getAppDeps(), session.customerId)
    return result.value
  })
}
