import { customerId as toCustomerId } from '@/domain'
import { getDevSessionResolver } from '@/infra/session/dev-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Dev-only: mint a session cookie for a given tenant so the portal can be exercised
 * before real authentication exists (M5).
 *
 * Deliberately blocked in production. This is not a login — it grants whatever tenant
 * is asked for, which is safe only because it cannot run outside development. The
 * signed cookie it produces is verified by exactly the same code path a real JWT
 * session will use, so the tenant-isolation behaviour under test is the production
 * behaviour.
 *
 * Accepts JSON (for scripts and tests) and form encoding (for the dev sign-in page,
 * which is a plain HTML form and therefore needs no client JavaScript).
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production' && process.env.PORTAL_PREVIEW_MODE !== '1') {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  let tenant: unknown
  let redirectTo: unknown

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as { tenant?: unknown } | null
      tenant = body?.tenant
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }
  } else {
    const form = await request.formData()
    tenant = form.get('tenant')
    redirectTo = form.get('redirectTo')
  }

  if (typeof tenant !== 'string' || tenant.trim() === '') {
    return Response.json(
      { error: 'tenant_required', hint: 'POST { "tenant": "c_..." }. Run `npm run verify` to list tenant ids.' },
      { status: 400 },
    )
  }

  const resolver = getDevSessionResolver()
  const token = resolver.issue({ customerId: toCustomerId(tenant.trim()) })
  const cookie = `${resolver.cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`

  // Only same-origin relative paths, so this cannot be turned into an open redirect.
  const target = typeof redirectTo === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(redirectTo) ? redirectTo : null

  if (target !== null) {
    return new Response(null, { status: 303, headers: { location: target, 'set-cookie': cookie } })
  }

  const response = Response.json({ ok: true, tenant: tenant.trim() })
  response.headers.append('set-cookie', cookie)
  return response
}
