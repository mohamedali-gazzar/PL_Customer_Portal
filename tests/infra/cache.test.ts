/**
 * Read-model cache behaviour: freshness, stale-while-revalidate, single-flight and
 * generation-based invalidation.
 *
 * Run against `MemoryCacheStore`, which implements the same contract as the Upstash
 * store — so the strategy is exercised without a Redis instance.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { customerId as toCustomerId } from '@/domain'
import { MemoryCacheStore } from '@/infra/cache/memory-store'
import { TenantCache } from '@/infra/cache/tenant-cache'

const A = toCustomerId('c_tenant_a')
const B = toCustomerId('c_tenant_b')

/** A controllable clock so expiry is tested by advancing time, not by sleeping. */
function harness(options: { freshMs?: number; staleMs?: number } = {}) {
  let now = 1_000_000
  const store = new MemoryCacheStore(() => now)
  const cache = new TenantCache(store, {
    freshMs: options.freshMs ?? 1_000,
    staleMs: options.staleMs ?? 10_000,
    generationMemoMs: 0,
    // The same clock the store uses. Two clocks would make every entry look
    // permanently stale — the exact bug these tests caught.
    now: () => now,
    // Run background revalidation inline so the test can await it deterministically.
    scheduleBackground: (work) => {
      pending.push(work())
    },
  })
  const pending: Promise<void>[] = []
  return {
    store,
    cache,
    advance: (ms: number) => {
      now += ms
    },
    settle: async () => {
      await Promise.all(pending)
      pending.length = 0
    },
  }
}

describe('freshness', () => {
  test('miss then hit', async () => {
    const h = harness()
    let calls = 0
    const compute = async () => {
      calls += 1
      return { n: calls }
    }

    const first = await h.cache.readModel('dashboard', A, [], compute)
    assert.equal(first.outcome, 'miss')
    assert.deepEqual(first.value, { n: 1 })

    const second = await h.cache.readModel('dashboard', A, [], compute)
    assert.equal(second.outcome, 'hit')
    assert.deepEqual(second.value, { n: 1 }, 'a hit must not recompute')
    assert.equal(calls, 1)
  })

  test('a hard-expired entry is a miss, not a stale serve', async () => {
    const h = harness({ freshMs: 1_000, staleMs: 5_000 })
    await h.cache.readModel('dashboard', A, [], async () => 'v1')
    h.advance(6_000)
    const after = await h.cache.readModel('dashboard', A, [], async () => 'v2')
    assert.equal(after.outcome, 'miss')
    assert.equal(after.value, 'v2')
  })
})

describe('stale-while-revalidate', () => {
  test('a stale entry answers immediately and refreshes behind the response', async () => {
    const h = harness({ freshMs: 1_000, staleMs: 60_000 })
    let value = 'v1'
    const compute = async () => value

    await h.cache.readModel('dashboard', A, [], compute)
    h.advance(2_000) // past fresh, well inside stale
    value = 'v2'

    const stale = await h.cache.readModel('dashboard', A, [], compute)
    // The caller waits for nothing: it gets the old value now.
    assert.equal(stale.outcome, 'stale')
    assert.equal(stale.value, 'v1')

    await h.settle()
    const next = await h.cache.readModel('dashboard', A, [], compute)
    assert.equal(next.outcome, 'hit')
    assert.equal(next.value, 'v2', 'the background refresh should have landed')
  })

  test('a failing background refresh never surfaces to the caller', async () => {
    const h = harness({ freshMs: 1_000, staleMs: 60_000 })
    await h.cache.readModel('dashboard', A, [], async () => 'good')
    h.advance(2_000)

    const stale = await h.cache.readModel('dashboard', A, [], async () => {
      throw new Error('provider down')
    })
    assert.equal(stale.value, 'good')
    await h.settle() // must not reject
  })
})

describe('single-flight', () => {
  test('concurrent misses for one key cause one computation', async () => {
    const h = harness()
    let calls = 0
    const compute = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return calls
    }

    const results = await Promise.all(
      Array.from({ length: 12 }, () => h.cache.readModel('dashboard', A, [], compute)),
    )

    assert.equal(calls, 1, 'a cache stampede must not multiply provider load')
    assert.deepEqual(new Set(results.map((r) => r.value)), new Set([1]))
  })

  test('different tenants are not collapsed together', async () => {
    const h = harness()
    const seen: string[] = []
    const computeFor = (tenant: string) => async () => {
      seen.push(tenant)
      return tenant
    }

    const [a, b] = await Promise.all([
      h.cache.readModel('dashboard', A, [], computeFor('A')),
      h.cache.readModel('dashboard', B, [], computeFor('B')),
    ])

    assert.equal(a.value, 'A')
    assert.equal(b.value, 'B')
    assert.deepEqual(seen.sort(), ['A', 'B'])
  })
})

describe('generation-based invalidation', () => {
  test('one increment retires every entry for that tenant', async () => {
    const h = harness()
    await h.cache.readModel('dashboard', A, [], async () => 'v1')
    await h.cache.readModel('projects', A, [], async () => 'v1')
    assert.equal((await h.cache.readModel('dashboard', A, [], async () => 'x')).outcome, 'hit')

    await h.cache.invalidateTenant(A)

    assert.equal((await h.cache.readModel('dashboard', A, [], async () => 'v2')).outcome, 'miss')
    assert.equal((await h.cache.readModel('projects', A, [], async () => 'v2')).outcome, 'miss')
  })

  test('invalidating one tenant leaves the other warm', async () => {
    const h = harness()
    await h.cache.readModel('dashboard', A, [], async () => 'a')
    await h.cache.readModel('dashboard', B, [], async () => 'b')

    await h.cache.invalidateTenant(A)

    assert.equal((await h.cache.readModel('dashboard', A, [], async () => 'a2')).outcome, 'miss')
    assert.equal((await h.cache.readModel('dashboard', B, [], async () => 'b2')).outcome, 'hit')
  })

  test('invalidation is O(1) — no key enumeration', async () => {
    const h = harness()
    for (let i = 0; i < 50; i += 1) {
      await h.cache.readModel('project-detail', A, [`SO-${i}`], async () => i)
    }
    const before = h.store.size
    await h.cache.invalidateTenant(A)
    // The old entries are simply unreachable; nothing was scanned or deleted.
    assert.equal(h.store.size, before)
    assert.equal((await h.cache.readModel('project-detail', A, ['SO-1'], async () => -1)).outcome, 'miss')
  })
})

describe('cache bypass', () => {
  test('a disabled cache always computes', async () => {
    const store = new MemoryCacheStore()
    const cache = new TenantCache(store, { freshMs: 1_000, staleMs: 1_000, enabled: false })
    let calls = 0
    for (let i = 0; i < 3; i += 1) {
      const r = await cache.readModel('dashboard', A, [], async () => (calls += 1))
      assert.equal(r.outcome, 'bypass')
    }
    assert.equal(calls, 3)
    assert.equal(store.size, 0)
  })
})
