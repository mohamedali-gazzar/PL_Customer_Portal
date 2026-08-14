/**
 * BFF route handlers, end to end.
 *
 * Calls the real handlers with real `Request` objects, so the whole path is
 * exercised: session resolution → tenant extraction → provider → domain → DTO →
 * response headers. This is where "the tenant comes from the session, never from a
 * request parameter" is proven at the HTTP boundary rather than one layer below it.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

// Set before any module reads it: the routes resolve their provider from the
// container, and no test may touch the real backlog export.
process.env.PORTAL_DATA_PROVIDER = 'fixture'
process.env.PORTAL_CACHE_DRIVER = 'memory'
process.env.DEV_SESSION_SECRET = 'test-secret'
process.env.PORTAL_LOG_SILENT = '1'

type Handler = (request: Request, context?: never) => Promise<Response>

let dashboardGet: Handler
let projectsGet: Handler
let projectDetailGet: (request: Request, ctx: { params: Promise<{ projectId: string }> }) => Promise<Response>
let healthGet: () => Promise<Response>
let issueCookie: (tenant: string) => string
let tenants: { A: string; B: string; projectA1: string; projectB1: string }

before(async () => {
  const [dash, list, detail, health, session, providers, domain] = await Promise.all([
    import('../../app/api/portal/dashboard/route'),
    import('../../app/api/portal/projects/route'),
    import('../../app/api/portal/projects/[projectId]/route'),
    import('../../app/api/health/route'),
    import('@/infra/session/dev-session'),
    import('@/providers'),
    import('@/domain'),
  ])

  dashboardGet = dash.GET as Handler
  projectsGet = list.GET as Handler
  projectDetailGet = detail.GET
  healthGet = health.GET

  const resolver = session.getDevSessionResolver()
  issueCookie = (tenant: string) =>
    `${resolver.cookieName()}=${resolver.issue({ customerId: domain.customerId(tenant) })}`

  tenants = {
    A: providers.TENANT_A,
    B: providers.TENANT_B,
    projectA1: providers.PROJECT_A1,
    projectB1: providers.PROJECT_B1,
  }
})

function request(url: string, cookie?: string): Request {
  return new Request(`http://portal.test${url}`, cookie === undefined ? {} : { headers: { cookie } })
}

describe('authentication', () => {
  test('no session → 401, and no data', async () => {
    const response = await dashboardGet(request('/api/portal/dashboard'))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'unauthenticated' })
  })

  test('a tampered cookie → 401', async () => {
    // The signature is what stops a customer editing the cookie to become another
    // tenant. Flipping one character of the payload must invalidate it.
    const valid = issueCookie(tenants.A)
    const tampered = valid.replace(/=(.)/, (_m, c) => `=${c === 'a' ? 'b' : 'a'}`)
    const response = await dashboardGet(request('/api/portal/dashboard', tampered))
    assert.equal(response.status, 401)
  })

  test('an unsigned cookie → 401', async () => {
    const payload = Buffer.from(JSON.stringify({ t: tenants.B }), 'utf8').toString('base64url')
    const response = await dashboardGet(request('/api/portal/dashboard', `pl_dev_session=${payload}.nosignature`))
    assert.equal(response.status, 401)
  })
})

describe('the tenant comes only from the session', () => {
  test('a query parameter naming another tenant is ignored', async () => {
    const response = await dashboardGet(
      request(`/api/portal/dashboard?customer=${tenants.B}&customerId=${tenants.B}`, issueCookie(tenants.A)),
    )
    assert.equal(response.status, 200)
    const body = (await response.json()) as { customer: { displayName: string } }
    assert.equal(body.customer.displayName, 'Fixture Contracting Co.', 'the session tenant must win')
  })

  test('a header naming another tenant is ignored', async () => {
    const response = await dashboardGet(
      new Request('http://portal.test/api/portal/dashboard', {
        headers: { cookie: issueCookie(tenants.A), 'x-customer-id': tenants.B },
      }),
    )
    const body = (await response.json()) as { customer: { displayName: string } }
    assert.equal(body.customer.displayName, 'Fixture Contracting Co.')
  })
})

describe('project detail', () => {
  test('own project → 200', async () => {
    const response = await projectDetailGet(request(`/api/portal/projects/${tenants.projectA1}`, issueCookie(tenants.A)), {
      params: Promise.resolve({ projectId: tenants.projectA1 }),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()) as { project: { id: string }; items: unknown[] }
    assert.equal(body.project.id, tenants.projectA1)
    assert.equal(body.items.length, 3)
  })

  test("another tenant's project → 404, not 403", async () => {
    const response = await projectDetailGet(request(`/api/portal/projects/${tenants.projectB1}`, issueCookie(tenants.A)), {
      params: Promise.resolve({ projectId: tenants.projectB1 }),
    })
    // 404 rather than 403: a 403 would confirm the id exists and belongs to someone.
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'not_found' })
  })

  test('a nonexistent project → the same 404', async () => {
    const response = await projectDetailGet(request('/api/portal/projects/SO-99-99999', issueCookie(tenants.A)), {
      params: Promise.resolve({ projectId: 'SO-99-99999' }),
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'not_found' })
  })

  test('a malformed project id → 404 with no stack trace', async () => {
    for (const bad of ['../../etc/passwd', 'a'.repeat(200), '', 'SO 26 00112']) {
      const response = await projectDetailGet(request(`/api/portal/projects/x`, issueCookie(tenants.A)), {
        params: Promise.resolve({ projectId: bad }),
      })
      assert.equal(response.status, 404, `expected 404 for ${JSON.stringify(bad)}`)
      const body = await response.text()
      assert.equal(/Error|stack|at /.test(body), false, 'no internal detail may leak')
    }
  })
})

describe('response headers', () => {
  test('customer data is never cacheable by a shared proxy', async () => {
    for (const response of [
      await dashboardGet(request('/api/portal/dashboard', issueCookie(tenants.A))),
      await projectsGet(request('/api/portal/projects', issueCookie(tenants.A))),
    ]) {
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    }
  })

  test('Server-Timing exposes the measurements outside production', async () => {
    const response = await dashboardGet(request('/api/portal/dashboard', issueCookie(tenants.A)))
    const timing = response.headers.get('Server-Timing')
    assert.ok(timing, 'expected Server-Timing outside production')
    assert.match(timing, /total;dur=\d+/)
    assert.match(timing, /provider;dur=\d+;desc="\d+ calls"/)
    assert.match(timing, /cache;desc="(hit|stale|miss)"/)
  })
})

describe('health', () => {
  test('reports the active provider and what it cannot answer', async () => {
    const response = await healthGet()
    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      ok: boolean
      provider: string
      capabilities: { stagesDerivable: number[]; finance: boolean; documents: boolean; scope: string }
    }
    assert.equal(body.ok, true)
    assert.equal(body.provider, 'fixture')
    assert.deepEqual(body.capabilities.stagesDerivable, [1, 2, 3])
    assert.equal(body.capabilities.finance, false)
    assert.equal(body.capabilities.documents, false)
    assert.equal(body.capabilities.scope, 'open_backlog_only')
  })

  test('health needs no session — it exposes nothing customer-specific', async () => {
    const body = await (await healthGet()).text()
    assert.equal(/Fixture Contracting|SO-26/.test(body), false)
  })
})
