/**
 * Backend call budgets.
 *
 * "Avoid N+1 ERPNext API calls" is a hard requirement, and the number that decides
 * it is how many provider calls one screen costs. Asserting it here means the
 * property is enforced now, against the Excel provider, rather than discovered
 * later against ERPNext.
 *
 * The load-bearing assertion is not the absolute number — it is that the number
 * does not grow with the count of projects or items.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getDashboard } from '@/application/dashboard'
import { getProjectDetail } from '@/application/project-detail'
import { getProjects } from '@/application/projects'
import { withRequestMetrics } from '@/infra/metrics/request-metrics'
import { PROJECT_A1, PROJECT_A2, PROJECT_B1, TENANT_A, TENANT_B } from '@/providers'
import { testDeps } from '../support/deps'

/**
 * Per-screen ceilings.
 *
 * Every read is tenant-level, never per item — which is the property that actually
 * decides whether this is fast against ERPNext. The absolute numbers are: source
 * description, plus one aggregate read, plus (on project detail) the account name for
 * the page header. Project detail is 3 rather than 2 because M4's header shows the
 * customer name and `getProject` returns only the order; the extra read is issued in
 * the same `Promise.all`, so wall-clock is unchanged, and it is 0 on the warm path.
 */
const COLD_BUDGET = 2
const COLD_BUDGET_PROJECT_DETAIL = 3

describe('cold path', () => {
  test(`dashboard costs at most ${COLD_BUDGET} provider calls`, async () => {
    const deps = testDeps()
    const { metrics } = await withRequestMetrics({ route: 'dashboard' }, async () =>
      getDashboard(deps, TENANT_A),
    )
    assert.ok(
      metrics.providerCalls <= COLD_BUDGET,
      `expected <= ${COLD_BUDGET}, got ${metrics.providerCalls}: ${metrics.calls.map((c) => c.method).join(', ')}`,
    )
  })

  test(`project detail costs at most ${COLD_BUDGET_PROJECT_DETAIL} provider calls`, async () => {
    const deps = testDeps()
    const { metrics } = await withRequestMetrics({ route: 'project-detail' }, async () =>
      getProjectDetail(deps, TENANT_A, PROJECT_A1),
    )
    assert.ok(
      metrics.providerCalls <= COLD_BUDGET_PROJECT_DETAIL,
      `got ${metrics.providerCalls}: ${metrics.calls.map((c) => c.method).join(', ')}`,
    )
  })

  test(`projects list costs at most ${COLD_BUDGET} provider calls`, async () => {
    const deps = testDeps()
    const { metrics } = await withRequestMetrics({ route: 'projects' }, async () =>
      getProjects(deps, TENANT_A),
    )
    assert.ok(metrics.providerCalls <= COLD_BUDGET, `got ${metrics.providerCalls}`)
  })
})

describe('no N+1', () => {
  test('a 3-item project costs the same as a 1-item project', async () => {
    // PROJECT_A1 has 3 lines, PROJECT_B1 has 1. If the composer looped per item,
    // these two numbers would differ — which is the whole failure mode.
    const many = await withRequestMetrics({ route: 'a' }, async () =>
      getProjectDetail(testDeps(), TENANT_A, PROJECT_A1),
    )
    const one = await withRequestMetrics({ route: 'b' }, async () =>
      getProjectDetail(testDeps(), TENANT_B, PROJECT_B1),
    )
    assert.equal(
      many.metrics.providerCalls,
      one.metrics.providerCalls,
      'provider calls must not scale with item count',
    )
    assert.equal(many.value.value?.items.length, 3)
    assert.equal(one.value.value?.items.length, 1)
  })

  test('a 2-project dashboard costs the same as a 1-project dashboard', async () => {
    const two = await withRequestMetrics({ route: 'a' }, async () => getDashboard(testDeps(), TENANT_A))
    const one = await withRequestMetrics({ route: 'b' }, async () => getDashboard(testDeps(), TENANT_B))
    assert.equal(two.metrics.providerCalls, one.metrics.providerCalls)
    assert.equal(two.value.value.projects.length, 2)
    assert.equal(one.value.value.projects.length, 1)
  })

  test('no per-item or per-project provider method is even called', async () => {
    const { metrics } = await withRequestMetrics({ route: 'dashboard' }, async () =>
      getDashboard(testDeps(), TENANT_A),
    )
    const methods = metrics.calls.map((c) => c.method)
    assert.equal(methods.filter((m) => m.endsWith('.getProject')).length, 0)
    assert.deepEqual(methods.sort(), ['fixture.getPortfolio', 'fixture.sourceInfo'])
  })
})

describe('warm path', () => {
  test('a warm dashboard makes zero provider calls', async () => {
    const deps = testDeps()
    await getDashboard(deps, TENANT_A) // warm

    const { value, metrics } = await withRequestMetrics({ route: 'dashboard' }, async () =>
      getDashboard(deps, TENANT_A),
    )
    assert.equal(value.outcome, 'hit')
    assert.equal(metrics.providerCalls, 0, 'a cached screen must not touch the backend at all')
    assert.equal(metrics.cache.hit, 1)
  })

  test('a warm project detail makes zero provider calls', async () => {
    const deps = testDeps()
    await getProjectDetail(deps, TENANT_A, PROJECT_A2)

    const { value, metrics } = await withRequestMetrics({ route: 'project-detail' }, async () =>
      getProjectDetail(deps, TENANT_A, PROJECT_A2),
    )
    assert.equal(value.outcome, 'hit')
    assert.equal(metrics.providerCalls, 0)
  })

  test('100 warm requests still make zero provider calls', async () => {
    const deps = testDeps()
    await getDashboard(deps, TENANT_A)

    const { metrics } = await withRequestMetrics({ route: 'dashboard' }, async () => {
      for (let i = 0; i < 100; i += 1) await getDashboard(deps, TENANT_A)
    })
    assert.equal(metrics.providerCalls, 0)
    assert.equal(metrics.cache.hit, 100)
  })
})

describe('instrumentation', () => {
  test('metrics record what performance work needs to measure', async () => {
    const deps = testDeps()
    const { metrics } = await withRequestMetrics({ route: 'dashboard', tenantHash: 'abc123' }, async () =>
      getDashboard(deps, TENANT_A),
    )
    assert.equal(metrics.route, 'dashboard')
    assert.equal(metrics.tenantHash, 'abc123')
    assert.ok(metrics.providerCalls > 0)
    assert.ok(metrics.totalMs >= 0)
    assert.ok(metrics.composeMs >= 0)
    assert.equal(metrics.cache.miss, 1)
    for (const call of metrics.calls) {
      assert.match(call.method, /^fixture\./)
      assert.ok(call.durationMs >= 0)
    }
  })
})
