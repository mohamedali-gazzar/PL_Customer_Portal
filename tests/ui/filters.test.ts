/**
 * The project filter, and the state the row's node is coloured from.
 *
 * A filter that quietly drops or double-counts a record is worse than no filter,
 * because the total on screen still looks authoritative.
 *
 * The state no longer resolves to any customer-facing words — those came off the
 * projects list — but it still has to resolve to exactly one value, because two
 * overlapping conditions colouring the same node is how a row ends up claiming
 * two things at once.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { byYear, orderYears } from '@/ui/lib/select'
import { PROJECT_STATUSES, projectStatus } from '@/ui/lib/status'
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

/* ------------------------------------------------------- the badge on a card -- */

test('a project resolves to exactly one state, by priority', () => {
  // The conditions overlap: an order can be late and awaiting approval at once.
  assert.equal(projectStatus(orders[0]!).key, 'ontrack')
  assert.equal(projectStatus(orders[1]!).key, 'late')
  assert.equal(projectStatus(orders[2]!).key, 'action')
  assert.equal(projectStatus(orders[3]!).key, 'late', 'late outranks awaiting approval')
  assert.equal(projectStatus(orders[4]!).key, 'hold')
  assert.equal(projectStatus(orders[5]!).key, 'hold', 'a hold outranks how late it is')
})

test('every project resolves to one of the declared statuses', () => {
  const keys = new Set(PROJECT_STATUSES.map((s) => s.key))
  for (const o of orders) assert.ok(keys.has(projectStatus(o).key))
})

test('filtering never mutates the source list', () => {
  const before = orders.map((o) => o.so)
  byYear(orders, '2025')
  assert.deepEqual(
    orders.map((o) => o.so),
    before,
  )
})
