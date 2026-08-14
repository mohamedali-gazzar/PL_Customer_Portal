import { getDashboard } from '@/application/dashboard'
import { getAppDeps } from '@/infra/container'
import { handlePortalRequest } from '@/infra/http/handler'

// The Excel provider reads a file, and the ERPNext provider will hold a
// server-side credential. Neither may run on the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handlePortalRequest('GET /api/portal/dashboard', request, async ({ session }) => {
    // The tenant comes from the session and nowhere else.
    const result = await getDashboard(getAppDeps(), session.customerId)
    return result.value
  })
}
