/**
 * The project filters.
 *
 * A filter that quietly drops or double-counts a record is worse than no filter,
 * because the total on screen still looks authoritative.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BACKLOG_BANDS, byBacklog, byYear, orderYears } from '@/ui/lib/select'
import type { PortalOrder } from '@/portal/types'

const order = (so: string, soDate: string | null, backlog: number): PortalOrder => ({
  so, cust: 'C', proj: 'P', pm: 'PM', soDate, cDate: null, cPeriod: null,
  items: [], contract: backlog, backlog, dvalue: 0, qty: 1, deliv: 0, hold: 0,
  pct: 0, nItems: 1, late: 0, dtc: null, age: null, next: null, await: 0,
})

const orders = [
  order('A', '2026-03-01', 25_000_000),
  order('B', '2025-07-01', 10_000_000),
  order('C', '2025-01-01', 9_999_999),
  order('D', '2024-05-01', 1_000_000),
  order('E', '2024-02-01', 999_999),
  order('F', null, 0),
]

test('years are listed most recent first, and blanks are not years', () => {
  assert.deepEqual(orderYears(orders), ['2026', '2025', '2024'])
})

test('"all" keeps everything, including an order with no date', () => {
  assert.equal(byYear(orders, 'all').length, 6)
  assert.equal(byBacklog(orders, 'all').length, 6)
})

test('a year selects only that year, and excludes undated orders', () => {
  assert.deepEqual(byYear(orders, '2025').map((o) => o.so), ['B', 'C'])
  assert.deepEqual(byYear(orders, '2024').map((o) => o.so), ['D', 'E'])
  assert.deepEqual(byYear(orders, '2023').map((o) => o.so), [])
})

test('the bands partition every order exactly once', () => {
  // The boundary is the trap: 10M and 1M each belong to one band, not two.
  const counted = BACKLOG_BANDS.flatMap((b) => byBacklog(orders, b.key).map((o) => o.so))
  assert.equal(counted.length, orders.length, 'no order is dropped or double-counted')
  assert.equal(new Set(counted).size, orders.length)
})

test('band boundaries are half-open at the top', () => {
  assert.deepEqual(byBacklog(orders, 'high').map((o) => o.so), ['A', 'B'], '10M is "10M and over"')
  assert.deepEqual(byBacklog(orders, 'mid').map((o) => o.so), ['C', 'D'], '1M is "1M - 10M"')
  assert.deepEqual(byBacklog(orders, 'low').map((o) => o.so), ['E', 'F'])
})

test('the two filters compose, narrowing rather than replacing', () => {
  const both = byBacklog(byYear(orders, '2024'), 'low')
  assert.deepEqual(both.map((o) => o.so), ['E'])

  const empty = byBacklog(byYear(orders, '2026'), 'low')
  assert.deepEqual(empty, [], 'an empty intersection is empty, not unfiltered')
})

test('filtering never mutates the source list', () => {
  const before = orders.map((o) => o.so)
  byYear(orders, '2025')
  byBacklog(orders, 'high')
  assert.deepEqual(orders.map((o) => o.so), before)
})
