/**
 * Lines whose factory record was never opened.
 *
 * `main_wos = 0` means no work order exists for the item. There is nothing wrong
 * with the line — the sales order is real, the contractual date is real — but the
 * five production stages have no documents to take dates from, so every one of
 * them would render as an empty card. Five blank cards in a row read as "your
 * panels are stuck", which is a different and worse claim than the truth.
 *
 * The export cannot tell us *why* the record is missing: a legacy line delivered
 * before the current ERP, and a line the factory has not been told about yet, look
 * identical here. So the wording states only what is known.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { journeyOf } from '@/portal/journey'
import { PRODUCTION_STAGES } from '@/portal/milestones'
import { STATE, type PortalItem, type Stage } from '@/portal/types'

const TODAY = '2026-08-23'
const gap = (): Stage => [STATE.none as Stage[0], 'Not ready', null, null, null]

function item(over: Partial<PortalItem> = {}): PortalItem {
  return {
    id: 0, so: 'SO-1', cust: 'Acme', code: 'C1', proj: 'P', pm: 'PM', grp: 'G', name: 'Panel',
    hold: 0, qty: 2, deliv: 0, remain: 2,
    rate: 1, contract: 2, backlog: 2, dvalue: 0,
    soDate: '2026-01-01', cDate: '2026-12-01', cPeriod: 60,
    wo: null, woQty: 0, prodQty: 0, woStatus: null, matStatus: null,
    rework: 0, rwStatus: null, ch: [], nIA: 0, nRev: 1, nRel: 0,
    T: [null, null, null, null, null, null, null, null],
    age: 100, dtc: 100, late: 0, pct: 10,
    st: [
      [STATE.done as Stage[0], 'Approved', '2026-01-01', '2026-01-05', null],
      gap(), gap(), gap(), gap(), gap(), gap(),
    ],
    nextStage: null, nextStatus: null,
    stage: 3, step: null, stepCode: null,
    since: null, dis: null, mainWos: 0,
    sd: ['2026-01-01', '2026-01-05', ...Array.from({ length: 14 }, () => null)],
    ...over,
  } as PortalItem
}

test('with no work order the production stages are marked unrecorded', () => {
  const stages = journeyOf(item(), TODAY)
  for (const n of PRODUCTION_STAGES) {
    const card = stages.find((s) => s.n === n)
    if (!card) continue // a conditional stage the item never entered
    assert.equal(card.unrecorded, true, `stage ${n} should be marked unrecorded`)
  }
})

test('the stages are still there to be counted, not hidden', () => {
  // A customer who reads "stage 6 of 11" on one line and finds six cards on
  // another has been told two different things about the same process.
  const withWo = journeyOf(item({ mainWos: 1 }), TODAY)
  const without = journeyOf(item(), TODAY)
  assert.equal(without.length, withWo.length)
  assert.deepEqual(without.map((s) => s.n), withWo.map((s) => s.n))
})

test('an unrecorded stage is never presented as late', () => {
  // No production document means no date to measure from. Anything that showed a
  // duration here would be counting from a day the factory never recorded.
  for (const st of journeyOf(item(), TODAY).filter((s) => s.unrecorded)) {
    assert.equal(st.days, null, `${st.label} claims a duration`)
    assert.equal(st.to, null, `${st.label} claims a finish date`)
    assert.equal(st.steps.every((x) => x.on === null), true, `${st.label} has a dated step`)
  }
})

test('the sales order side of the line is untouched', () => {
  // Order Creation has real dates from the SO. Losing them because production is
  // unrecorded would throw away the one part of the record that is complete.
  const first = journeyOf(item(), TODAY)[0]!
  assert.equal(first.n, 0)
  assert.notEqual(first.unrecorded, true)
  assert.equal(first.from, '2026-01-01')
})

test('a line that does have a work order is completely unaffected', () => {
  const normal = journeyOf(item({ mainWos: 2, wo: 'MFG-WO-1, MFG-WO-2' }), TODAY)
  assert.equal(normal.some((s) => s.unrecorded), false)
})

test('a delivered line with no work order still shows as delivered', () => {
  // The legacy case: shipped years ago, before the work orders were in this ERP.
  // Production being unrecorded must not walk back the delivery.
  const delivered = item({
    mainWos: 0, deliv: 2, remain: 0, backlog: 0, dvalue: 100, stage: 11, pct: 100,
    st: [
      [STATE.done as Stage[0], 'Approved', '2026-01-01', '2026-01-05', null],
      gap(), gap(), gap(), gap(),
      [STATE.done as Stage[0], 'Delivered', null, null, null],
      gap(),
    ],
  })
  const stages = journeyOf(delivered, TODAY)
  const delivery = stages.find((s) => s.n === 8)
  assert.ok(delivery, 'the delivery stage exists')
  assert.equal(stages.some((s) => s.unrecorded), true, 'production is still unrecorded')
})
