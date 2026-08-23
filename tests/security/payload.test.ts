/**
 * What actually reaches the browser.
 *
 * The distinction this file exists to hold: "not rendered" is not "not sent". Every
 * field of the internal model used to be serialised into the customer payload,
 * including a derived unit price, the raw rework work-order status and the names of
 * ERP finance documents. None of it was on screen; all of it was one devtools tab
 * away.
 *
 * `CustomerItem` is now the wire contract. These tests assert against the
 * serialised JSON rather than the type, because a type is erased at runtime and the
 * thing the customer receives is the string.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scopeToCustomer } from '@/portal/scope'
import {
  CUSTOMER_ITEM_OMITTED,
  CUSTOMER_ORDER_OMITTED,
  STATE,
  type PortalItem,
  type PortalSnapshot,
  type Stage,
} from '@/portal/types'

const stage = (state: number, status: string): Stage =>
  [state as Stage[0], status, null, null, '2026-06-01']

function item(id: number, so: string, cust: string): PortalItem {
  return {
    id, so, cust, code: `C${id}`, proj: `${so} project`, pm: 'PM', grp: 'G', name: 'Name',
    hold: 0, qty: 2, deliv: 1, remain: 1,
    rate: 141352.71, contract: 565410.88, backlog: 282705.44, dvalue: 282705.44,
    soDate: '2026-01-01', cDate: '2026-06-01', cPeriod: 60,
    wo: 'MFG-WO-2026-01522', woQty: 2, prodQty: 1,
    woStatus: 'In Process', matStatus: 'Partially Available',
    rework: 1, rwStatus: 'Disassembled',
    ch: ['2026-01-01', '2026-02-01'],
    nIA: 1, nRev: 2, nRel: 1,
    T: [10, 20, 30, null, null, null, null, null],
    age: 100, dtc: 12, late: 0, pct: 55,
    st: [
      stage(STATE.done, 'Approved'),
      stage(STATE.done, 'Fully available'),
      stage(STATE.active, 'In progress'),
      stage(STATE.none, 'Not ready'),
      stage(STATE.gap, 'Awaiting Payment Entry feed'),
      stage(STATE.none, 'Not ready'),
      stage(STATE.gap, 'Awaiting Sales Invoice feed'),
    ],
    nextStage: 'FAT / Quality', nextStatus: 'Ready for FAT',
    stage: 6, step: 'In production', stepCode: 9,
    since: '2026-05-01', dis: 21, mainWos: 1,
    sd: Array.from({ length: 16 }, () => null),
  }
}

function world(): PortalSnapshot {
  const items = [item(0, 'SO-1', 'Acme'), item(1, 'SO-2', 'Rival')]
  const order = (so: string, cust: string, ids: number[]) => ({
    so, cust, proj: `${so} project`, pm: 'PM',
    soDate: '2026-01-01', cDate: '2026-06-01', cPeriod: 60,
    items: ids, contract: 1, backlog: 1, dvalue: 0, qty: 2, deliv: 1,
    hold: 0, pct: 55, nItems: 1, late: 0, dtc: 12, age: 479,
    next: 'Awaiting Payment Entry feed', await: 0,
  })
  const customer = (name: string) => ({
    name, orders: [], contract: 1, backlog: 1, dvalue: 0,
    nItems: 1, late: 0, await: 0, nOrders: 1, pct: 55,
  })
  return {
    meta: {
      exportDate: '2026-08-22', rows: 2, orders: 2, customers: 2,
      backlog: 2, contract: 2, delivered: 0, lateOrders: 0, holdOrders: 0,
      bench: [], pms: [], groups: [],
    },
    items,
    orders: [order('SO-1', 'Acme', [0]), order('SO-2', 'Rival', [1])],
    customers: [{ ...customer('Acme'), orders: ['SO-1'] }, { ...customer('Rival'), orders: ['SO-2'] }],
  } as unknown as PortalSnapshot
}

const wireFor = (name: string) => JSON.stringify(scopeToCustomer(world(), name))

test('the unit price never reaches the browser', () => {
  // Derived as backlog ÷ remaining. Nothing renders it, and a per-unit figure is
  // a different disclosure from the line total the customer already knows.
  const wire = wireFor('Acme')
  assert.ok(!wire.includes('rate'), 'the field is gone')
  assert.ok(!wire.includes('141352.71'), 'and so is the number')
})

test('the raw rework work-order status never reaches the browser', () => {
  // "Disassembled" describes what the factory did to the panel. The customer is
  // told an item is under modification and nothing further.
  const wire = wireFor('Acme')
  assert.ok(!wire.includes('rwStatus'))
  assert.ok(!wire.includes('Disassembled'))
})

test('no ERP finance document is named on the wire', () => {
  // The two stages the export cannot feed used to carry "Awaiting Payment Entry
  // feed" and "Awaiting Sales Invoice feed" on every single line.
  const wire = wireFor('Acme')
  for (const term of ['Invoice', 'invoice', 'Payment', 'payment', 'Outstanding']) {
    assert.ok(!wire.includes(term), `"${term}" is on the wire`)
  }
})

test('the retired model is not shipped alongside the current one', () => {
  const wire = wireFor('Acme')
  /* `stepCode` is no longer on this list. It is the report's stable identifier
     for the current step, and the portal keys the step's label off it rather than
     matching the report's prose — 9 is Production In-progress and 90 is a
     modification, which the text cannot distinguish. A small integer with no
     meaning outside the stage model. */
  for (const f of ['nextStage', 'nextStatus', '"ch"', '"T"', 'prodQty']) {
    assert.ok(!wire.includes(f), `${f} is still sent`)
  }
})

test('every omitted field is absent, and the list is the single source', () => {
  const scoped = scopeToCustomer(world(), 'Acme')!
  for (const key of CUSTOMER_ITEM_OMITTED) {
    assert.ok(!(key in (scoped.items[0] as Record<string, unknown>)), `${key} survived`)
  }
})

test('what the screens do need is still there', () => {
  // The counterpart to the removals: stripping the payload must not strip the
  // portal. These are the fields the cards, the bar and the table read.
  const it = scopeToCustomer(world(), 'Acme')!.items[0]!
  for (const key of ['st', 'sd', 'stage', 'step', 'since', 'dis', 'mainWos',
                     'matStatus', 'wo', 'woStatus', 'rework', 'nRev',
                     'qty', 'deliv', 'contract', 'backlog', 'dvalue', 'pct', 'cDate']) {
    assert.ok(key in (it as Record<string, unknown>), `${key} is needed and missing`)
  }
})

test('the gap stages keep their shape so nothing downstream changes', () => {
  // Only the wording is replaced. The state stays `gap`, and the planned date the
  // Gantt's markers read stays where it was.
  const it = scopeToCustomer(world(), 'Acme')!.items[0]!
  assert.equal(it.st.length, 7)
  assert.equal(it.st[4]![0], STATE.gap)
  assert.equal(it.st[4]![4], '2026-06-01', 'the planned date survives')
  assert.equal(it.st[2]![1], 'In progress', 'a non-gap status is untouched')
})

test('no other customer appears in a payload, at any depth', () => {
  const wire = wireFor('Acme')
  assert.ok(!wire.includes('Rival'), 'a rival name is in the payload')
  assert.ok(!wire.includes('SO-2'))
  assert.equal(scopeToCustomer(world(), 'Acme')!.items.every((i) => i.cust === 'Acme'), true)
})

test('the order roll-up drops its internal fields too', () => {
  // Found by scanning the real export rather than by reading the type: the item
  // DTO was clean while the order beside it still carried a cycle-time metric and,
  // for orders parked at a stage the export cannot feed, the name of the ERP
  // document behind it.
  const wire = wireFor('Acme')
  assert.ok(!wire.includes('"age":'), 'order age is on the wire')
  assert.ok(!wire.includes('"next":'), 'order next-status is on the wire')
  assert.ok(!wire.includes('Awaiting Payment Entry'), 'the feed wording is on the wire')

  const order = scopeToCustomer(world(), 'Acme')!.orders[0]!
  for (const key of CUSTOMER_ORDER_OMITTED) {
    assert.ok(!(key in (order as Record<string, unknown>)), `${key} survived`)
  }
  // and the order is still an order
  for (const key of ['so', 'proj', 'cDate', 'contract', 'backlog', 'dvalue', 'items', 'await']) {
    assert.ok(key in (order as Record<string, unknown>), `${key} is needed and missing`)
  }
})

test('an unknown customer gets nothing rather than an empty portal', () => {
  // An empty portal would let someone enumerate which company names exist.
  assert.equal(scopeToCustomer(world(), 'Nobody Ltd'), null)
})
