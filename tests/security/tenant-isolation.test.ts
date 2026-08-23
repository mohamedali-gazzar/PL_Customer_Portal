/**
 * Customer A must never be able to retrieve customer B's data — brief §7.1.
 *
 * `scopeToCustomer` is the one place the cut is made, so this is where the
 * guarantee is proved. The tests below are written as the attempt rather than the
 * assertion: what would leak, if the scoping were wrong?
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scopeToCustomer, gatewayView, consoleView } from '@/portal/scope'
import type { PortalItem, PortalOrder, PortalSnapshot, Stage } from '@/portal/types'
import { STATE } from '@/portal/types'

/* -- a two-tenant world, small enough to reason about completely ----------- */

const stage = (status: string): Stage => [STATE.done, status, '2026-01-01', '2026-01-05', null]

function item(id: number, so: string, cust: string, code: string): PortalItem {
  return {
    id, so, cust, code,
    proj: `${so} project`, pm: 'PM', grp: 'Group', name: code,
    hold: 0, qty: 1, deliv: 0, remain: 1,
    rate: 100, contract: 100, backlog: 100, dvalue: 0,
    soDate: '2026-01-01', cDate: '2026-06-01', cPeriod: 60,
    rework: 0,
    ch: ['2026-01-01'],
    nIA: 0, nRev: 0, nRel: 1,
    T: [null, null, null, null, null, null, null, null],
    age: 10, dtc: 5, late: 0, pct: 50,
    st: [stage('Approved'), stage('Fully available'), stage('Completed'), stage('Ready for FAT'),
         [STATE.gap, 'Awaiting Payment Entry feed', null, null, null],
         stage('Ready for delivery'),
         [STATE.gap, 'Awaiting Sales Invoice feed', null, null, null]],
    nextStage: 'Pre-Delivery Payment', nextStatus: 'Awaiting Payment Entry feed',
    stage: 4, step: 'Material checked', stepCode: 7,
    since: '2026-02-01', dis: 12, mainWos: 1,
    sd: Array.from({ length: 16 }, () => null),
  }
}

function order(so: string, cust: string, items: number[]): PortalOrder {
  return {
    so, cust, proj: `${so} project`, pm: 'PM',
    soDate: '2026-01-01', cDate: '2026-06-01', cPeriod: 60,
    items, contract: 100 * items.length, backlog: 100 * items.length, dvalue: 0,
    qty: items.length, deliv: 0, hold: 0, pct: 50, nItems: items.length,
    late: 0, dtc: 5, age: 10, next: 'Ready for FAT', await: 0,
  }
}

const SNAPSHOT: PortalSnapshot = {
  meta: {
    exportDate: '2026-08-11',
    rows: 3, orders: 2, customers: 2,
    backlog: 300, contract: 300, delivered: 0,
    lateOrders: 0, holdOrders: 0,
    bench: [], pms: [{ n: 'PM', c: 3 }], groups: [{ n: 'Group', c: 3 }],
  },
  items: [
    item(0, 'SO-A', 'Alpha Co', 'ALPHA-PANEL'),
    item(1, 'SO-B', 'Beta Co', 'BETA-SECRET-PANEL'),
    item(2, 'SO-B', 'Beta Co', 'BETA-SECRET-PANEL-2'),
  ],
  orders: [order('SO-B', 'Beta Co', [1, 2]), order('SO-A', 'Alpha Co', [0])],
  customers: [
    { name: 'Beta Co', orders: ['SO-B'], contract: 200, backlog: 200, dvalue: 0, nItems: 2, late: 0, await: 0, nOrders: 1, pct: 50 },
    { name: 'Alpha Co', orders: ['SO-A'], contract: 100, backlog: 100, dvalue: 0, nItems: 1, late: 0, await: 0, nOrders: 1, pct: 50 },
  ],
}

/* ------------------------------------------------------------------ tests -- */

test('a scoped payload contains no trace of another tenant', () => {
  const alpha = scopeToCustomer(SNAPSHOT, 'Alpha Co')
  assert.ok(alpha)

  const serialised = JSON.stringify(alpha)
  assert.doesNotMatch(serialised, /Beta Co/, 'another customer name leaked')
  assert.doesNotMatch(serialised, /BETA-SECRET/, "another customer's item codes leaked")
  assert.doesNotMatch(serialised, /SO-B/, "another customer's order numbers leaked")

  assert.equal(alpha.orders.length, 1)
  assert.equal(alpha.items.length, 1)
  assert.ok(alpha.orders.every((o) => o.cust === 'Alpha Co'))
  assert.ok(alpha.items.every((i) => i.cust === 'Alpha Co'))
})

test('portfolio-wide figures never reach a customer', () => {
  const alpha = scopeToCustomer(SNAPSHOT, 'Alpha Co')!

  // The company's total backlog, its PM workloads and its product mix are all
  // commercially sensitive, and none of them are any single customer's business.
  assert.deepEqual(Object.keys(alpha.meta), ['exportDate'])
  const serialised = JSON.stringify(alpha)
  assert.doesNotMatch(serialised, /"pms"/)
  assert.doesNotMatch(serialised, /"groups"/)
  assert.doesNotMatch(serialised, /"lateOrders"/)
})

test('item ids are renumbered, so the payload does not disclose the source size', () => {
  const beta = scopeToCustomer(SNAPSHOT, 'Beta Co')!
  assert.deepEqual(beta.items.map((i) => i.id), [0, 1])
  // The order must still point at its own lines after renumbering.
  assert.deepEqual(beta.orders[0]!.items, [0, 1])
  const referenced = new Set(beta.orders.flatMap((o) => o.items))
  assert.equal(referenced.size, beta.items.length)
})

test('an unknown customer yields nothing at all, not an empty portal', () => {
  // An empty portal would let someone enumerate real company names by watching
  // which ones render and which ones fail.
  assert.equal(scopeToCustomer(SNAPSHOT, 'Nonexistent Ltd'), null)
  assert.equal(scopeToCustomer(SNAPSHOT, ''), null)
  assert.equal(scopeToCustomer(SNAPSHOT, 'alpha co'), null, 'matching must not be case-insensitive')
})

test('a line whose own customer disagrees with its order is not served', () => {
  // A data fault must not become a disclosure: the join alone is not authority.
  const corrupted: PortalSnapshot = {
    ...SNAPSHOT,
    orders: [order('SO-A', 'Alpha Co', [0, 1]), ...SNAPSHOT.orders.filter((o) => o.so !== 'SO-A')],
  }
  const alpha = scopeToCustomer(corrupted, 'Alpha Co')!
  assert.equal(alpha.items.length, 1)
  assert.doesNotMatch(JSON.stringify(alpha), /BETA-SECRET/)
})

test('the sign-in screen publishes nothing once demo mode is off', () => {
  const production = gatewayView(SNAPSHOT, false)
  assert.equal(production.stats, null)
  assert.equal(production.customers, null)
  assert.deepEqual(Object.keys(production).sort(), ['customers', 'demoMode', 'exportDate', 'stats'])

  const demo = gatewayView(SNAPSHOT, true)
  assert.ok(demo.stats)
  assert.equal(demo.customers?.length, 2)
})

test('the staff view is a separate function, and returns everything', () => {
  const all = consoleView(SNAPSHOT)
  assert.equal(all.customers.length, 2)
  assert.equal(all.items.length, 3)
})
