import { getAppDeps } from '@/infra/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Liveness plus a statement of what the active source can answer.
 *
 * No tenant is involved and nothing customer-specific is returned, so this is the one
 * portal route with no session.
 *
 * Building the container is inside the try: it is the step that refuses to run on a
 * provisional tenant identity, and that refusal is precisely the condition an ops
 * check exists to surface. A 500 with a stack trace would be the least useful possible
 * response to it, so it reports 503 with the reason instead.
 */
export async function GET(): Promise<Response> {
  try {
    const deps = getAppDeps()
    const capabilities = deps.provider.capabilities()

    let source: unknown = null
    let ok = true
    try {
      const info = await deps.provider.sourceInfo()
      source = {
        providerId: info.providerId,
        asOf: info.asOf.state === 'known' ? info.asOf.value : null,
        isLive: info.isLive,
        identityAssurance: info.identityAssurance.level,
      }
    } catch (error) {
      ok = false
      source = { error: error instanceof Error ? error.message : String(error) }
    }

    return Response.json(
      {
        ok,
        provider: deps.provider.id,
        cache: deps.cache.driver,
        today: deps.clock.today(),
        previewMode: process.env.PORTAL_PREVIEW_MODE === '1',
        source,
        capabilities: {
          stagesDerivable: [
            capabilities.drawings ? 1 : null,
            capabilities.materialStatus ? 2 : null,
            capabilities.manufacturing ? 3 : null,
            capabilities.fatEvents ? 4 : null,
            capabilities.finance !== false ? 5 : null,
            capabilities.deliveryEvents ? 6 : null,
            capabilities.finance !== false ? 7 : null,
          ].filter((s) => s !== null),
          finance: capabilities.finance !== false,
          documents: capabilities.documents,
          scope: capabilities.scope,
        },
      },
      { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      {
        ok: false,
        reason: 'provider_unavailable',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
