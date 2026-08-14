/**
 * Cache-key isolation.
 *
 * The requirement is "do not cache data in a way that could leak one customer's
 * data to another". These tests treat that as a property of the key builders
 * rather than of any single call site, so a future builder that forgets the tenant
 * segment fails here.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { customerId as toCustomerId, projectId as toProjectId } from '@/domain'
import {
  generationKey,
  keyIncludesTenant,
  lockKey,
  projectDetailKey,
  readModelKey,
  SCHEMA_VERSION,
} from '@/infra/cache/keys'

const A = toCustomerId('c_tenant_a')
const B = toCustomerId('c_tenant_b')
const PROJECT = toProjectId('SO-26-00112')

describe('every key names its tenant', () => {
  const builders: [string, (t: typeof A) => string][] = [
    ['generationKey', (t) => generationKey(t)],
    ['readModelKey/dashboard', (t) => readModelKey(t, 0, 'dashboard')],
    ['readModelKey/projects', (t) => readModelKey(t, 3, 'projects')],
    ['projectDetailKey', (t) => projectDetailKey(t, 3, PROJECT)],
    ['lockKey', (t) => lockKey(readModelKey(t, 3, 'dashboard'))],
  ]

  for (const [name, build] of builders) {
    test(`${name} is tenant-scoped and distinct per tenant`, () => {
      const forA = build(A)
      const forB = build(B)
      assert.notEqual(forA, forB, 'two tenants must never share a key')
      assert.ok(keyIncludesTenant(forA as never, A))
      assert.equal(keyIncludesTenant(forA as never, B), false)
    })
  }
})

describe('key content', () => {
  test('the raw tenant key is hashed, so no customer name reaches the cache', () => {
    const key = readModelKey(A, 1, 'dashboard')
    assert.equal(key.includes('c_tenant_a'), false)
  })

  test('the schema version is part of every key, so a rule change invalidates on deploy', () => {
    assert.ok(readModelKey(A, 1, 'dashboard').includes(`:s${SCHEMA_VERSION}:`))
  })

  test('the generation is part of the key, so a bump retires every entry', () => {
    assert.notEqual(readModelKey(A, 1, 'dashboard'), readModelKey(A, 2, 'dashboard'))
  })

  test('the generation counter itself survives its own bump', () => {
    // It must not be generation-scoped, or incrementing it would orphan the counter.
    assert.equal(generationKey(A).includes(':g:'), false)
  })

  test('different read models never collide', () => {
    const names = ['dashboard', 'projects', 'project-detail', 'finance', 'documents'] as const
    const keys = names.map((n) => readModelKey(A, 1, n))
    assert.equal(new Set(keys).size, names.length)
  })

  test('key parts are sanitised, so a hostile id cannot forge a key segment', () => {
    const injected = readModelKey(A, 1, 'project-detail', '../../t/other:g:9:rm:dashboard')
    assert.equal(injected.includes('../'), false)
    assert.ok(keyIncludesTenant(injected, A))
  })
})
