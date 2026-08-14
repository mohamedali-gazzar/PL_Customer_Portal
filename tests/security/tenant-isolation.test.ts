/**
 * Cross-tenant isolation.
 *
 * PDF §7.1 makes this a launch gate: "Automated tests must prove customer A can
 * never retrieve customer B's data (IDOR tests on every endpoint)." The matrix
 * below walks every read entry point with a session for tenant A and every
 * identifier belonging to tenant B.
 *
 * It also pins the response shape: `null` (→ 404), never a distinguishable error.
 * A 403 would confirm the identifier exists, which is itself a leak.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getDashboard } from '@/application/dashboard'
import { getProjectDetail } from '@/application/project-detail'
import { getProjects } from '@/application/projects'
import { customerId as toCustomerId } from '@/domain'
import { PROJECT_A1, PROJECT_A2, PROJECT_B1, TENANT_A, TENANT_B } from '@/providers'
import { testDeps } from '../support/deps'

const TENANTS = [
  { name: 'A', id: TENANT_A, own: [PROJECT_A1, PROJECT_A2], foreign: [PROJECT_B1] },
  { name: 'B', id: TENANT_B, own: [PROJECT_B1], foreign: [PROJECT_A1, PROJECT_A2] },
]

describe('IDOR matrix — project detail', () => {
  for (const tenant of TENANTS) {
    for (const projectId of tenant.foreign) {
      test(`tenant ${tenant.name} cannot read ${projectId}`, async () => {
        const deps = testDeps()
        const result = await getProjectDetail(deps, tenant.id, projectId)
        assert.equal(result.value, null, 'a foreign project must resolve to null, which the route turns into 404')
      })
    }
    for (const projectId of tenant.own) {
      test(`tenant ${tenant.name} can read its own ${projectId}`, async () => {
        const deps = testDeps()
        const result = await getProjectDetail(deps, tenant.id, projectId)
        assert.ok(result.value, 'own project must be readable')
        assert.equal(result.value.project.id, projectId)
      })
    }
  }
})

describe('IDOR matrix — collection endpoints', () => {
  test('a dashboard contains only the requesting tenant\'s projects', async () => {
    const deps = testDeps()
    const a = await getDashboard(deps, TENANT_A)
    const ids = a.value.projects.map((p) => p.id)
    assert.deepEqual(ids.sort(), [PROJECT_A2, PROJECT_A1].sort())
    assert.equal(ids.includes(PROJECT_B1), false)
  })

  test('a projects list contains only the requesting tenant\'s projects', async () => {
    const deps = testDeps()
    const b = await getProjects(deps, TENANT_B)
    assert.deepEqual(b.value.projects.map((p) => p.id), [PROJECT_B1])
  })

  test('no other tenant\'s name appears anywhere in a payload', async () => {
    const deps = testDeps()
    const a = await getDashboard(deps, TENANT_A)
    const serialized = JSON.stringify(a.value)
    assert.equal(serialized.includes('Other Fixture Industrial'), false)
    assert.equal(serialized.includes('Other PM'), false)
    assert.equal(serialized.includes(PROJECT_B1), false)
  })
})

describe('unknown tenants', () => {
  test('an unrecognised tenant gets no data', async () => {
    const deps = testDeps()
    const stranger = toCustomerId('c_does_not_exist')
    await assert.rejects(() => getDashboard(deps, stranger))
    const detail = await getProjectDetail(deps, stranger, PROJECT_A1)
    assert.equal(detail.value, null)
  })
})

describe('warm cache does not weaken isolation', () => {
  test('a cached payload for A is never served to B', async () => {
    // Both tenants share one cache instance, and A is warmed first — the shape of
    // bug this guards against is a key that omits the tenant, where B would then
    // read A's warm entry.
    const deps = testDeps()

    const a1 = await getDashboard(deps, TENANT_A)
    assert.equal(a1.outcome, 'miss')
    const a2 = await getDashboard(deps, TENANT_A)
    assert.equal(a2.outcome, 'hit')

    const b1 = await getDashboard(deps, TENANT_B)
    assert.equal(b1.outcome, 'miss', 'B must not hit A\'s cache entry')
    assert.equal(b1.value.customer.displayName, 'Other Fixture Industrial')
    assert.deepEqual(b1.value.projects.map((p) => p.id), [PROJECT_B1])
  })

  test('project detail for the same id is cached per tenant', async () => {
    const deps = testDeps()
    // A owns PROJECT_A1; B does not. B must get null even after A warmed it.
    await getProjectDetail(deps, TENANT_A, PROJECT_A1)
    const forB = await getProjectDetail(deps, TENANT_B, PROJECT_A1)
    assert.equal(forB.value, null)
  })
})
