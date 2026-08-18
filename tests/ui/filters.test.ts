/**
 * The project filters.
 *
 * A filter that quietly drops or double-counts a record is worse than no filter,
 * because the total on screen still looks authoritative. And a status filter that
 * disagrees with the badge on the card is worse still: you select "Past contractual
 * date" and get cards labelled something else.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { byYear, orderYears } from '@/ui/lib/select'
import { PROJECT_STATUSES, byStatus, projectStatus, statusCounts } from '@/ui/lib/status'
import type { PortalOrder } from '@/portal/types'

interface Flags {
  hold?: number
  late?: number
  await?: number
}

const order = (so: string, soDate: string | null, flags: Flags = {}): PortalOrder => ({
  so,
  cust: 'C',
  proj: 'P',
  pm: 'PM',
  soDate,
  cDate: null,
  cPeriod: null,
  items: [],
  contract: 1000,
  backlog: 1000,
  dvalue: 0,
  qty: 1,
  deliv: 0,
  hold: flags.hold ?? 0,
  pct: 0,
  nItems: 1,
  late: flags.late ?? 0,
  dtc: null,
  age: null,
  next: null,
  await: flags.await ?? 0,
})

/**
 * The overlaps are the point. In the real portfolio 7 orders are both late and
 * awaiting approval, and 7 more are both on hold and late.
 */
const orders = [
  order('CLEAN', '2026-03-01'),
  order('LATE', '2026-02-01', { late: 1 }),
  order('WAITING', '2025-07-01', { await: 1 }),
  order('LATE_AND_WAITING', '2025-01-01', { late: 1, await: 1 }),
  order('HELD', '2024-05-01', { hold: 1 }),
  order('HELD_AND_LATE', '2024-02-01', { hold: 1, late: 1 }),
  order('UNDATED', null, { late: 1 }),
]

/* ------------------------------------------------------------------- years -- */

test('years are listed most recent first, and blanks are not years', () => {
  assert.deepEqual(orderYears(orders), ['2026', '2025', '2024'])
})

test('a year selects only that year, and excludes undated orders', () => {
  assert.deepEqual(byYear(orders, '2025').map((o) => o.so), ['WAITING', 'LATE_AND_WAITING'])
  assert.deepEqual(byYear(orders, '2023').map((o) => o.so), [])
  assert.equal(byYear(orders, 'all').length, 7, 'all keeps the undated order too')
})

/* ------------------------------------------------------------------ status -- */

test('a project has exactly one status, resolved by priority', () => {
  assert.equal(projectStatus(orders[0]!).key, 'ontrack')
  assert.equal(projectStatus(orders[1]!).key, 'late')
  assert.equal(projectStatus(orders[2]!).key, 'action')
  assert.equal(projectStatus(orders[3]!).key, 'late', 'late outranks awaiting approval')
  assert.equal(projectStatus(orders[4]!).key, 'hold')
  assert.equal(projectStatus(orders[5]!).key, 'hold', 'a hold outranks how late it is')
})

test('the statuses partition every project exactly once', () => {
  // Filtering on overlapping flags instead would show an order under two statuses,
  // and the counts beside the options would then exceed the total.
  const counted = PROJECT_STATUSES.flatMap((st) => byStatus(orders, st.key).map((o) => o.so))
  assert.equal(counted.length, orders.length, 'no project is dropped or double-counted')
  assert.equal(new Set(counted).size, orders.length)
})

test('the counts beside the options sum to the list they describe', () => {
  const counts = statusCounts(orders)
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), orders.length)
  assert.deepEqual(counts, { hold: 2, late: 3, action: 1, ontrack: 1 })
})

test('filtering by a status returns exactly the projects whose badge says so', () => {
  for (const st of PROJECT_STATUSES) {
    for (const o of byStatus(orders, st.key)) {
      assert.equal(
        projectStatus(o).key,
        st.key,
        `${o.so} was returned under "${st.label}" but its badge says "${projectStatus(o).label}"`,
      )
    }
  }
})

test('"all" keeps everything', () => {
  assert.equal(byStatus(orders, 'all').length, orders.length)
})

/* ------------------------------------------------------------- composition -- */

test('the two filters compose, narrowing rather than replacing', () => {
  const both = byStatus(byYear(orders, '2024'), 'hold')
  assert.deepEqual(both.map((o) => o.so), ['HELD', 'HELD_AND_LATE'])

  const empty = byStatus(byYear(orders, '2026'), 'hold')
  assert.deepEqual(empty, [], 'an empty intersection is empty, not unfiltered')
})

test('status counts follow the chosen year, so the options describe what is shown', () => {
  const in2024 = byYear(orders, '2024')
  assert.deepEqual(statusCounts(in2024), { hold: 2, late: 0, action: 0, ontrack: 0 })
})

test('filtering never mutates the source list', () => {
  const before = orders.map((o) => o.so)
  byYear(orders, '2025')
  byStatus(orders, 'late')
  assert.deepEqual(orders.map((o) => o.so), before)
})
