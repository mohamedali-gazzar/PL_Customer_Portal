/**
 * The timeline bar.
 *
 * One segment per stage, in stage colours — the same division of time as the cards
 * above it. It used to be cut by T-phase, which is the ERP's own measurement
 * vocabulary and did not line up with the cards, so the reader had to translate
 * between two views of the same fortnight.
 *
 * The invariant that matters: a segment measures the time a stage is answerable
 * for, and no boundary is ever invented for a date nobody recorded.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildBands, FAMILIES } from '@/portal/bands'
import { SLOT, STEP_SLOTS } from '@/portal/milestones'
import { STATE, type PortalItem, type Stage } from '@/portal/types'

const TODAY = '2026-08-22'
const gap = (s: string): Stage => [STATE.gap, s, null, null, null]
const noDates = () => Array.from({ length: STEP_SLOTS }, () => null) as (string | null)[]

function panel(opts: {
  stage: number
  sd?: (string | null)[]
  rework?: number
  qty?: number
  deliv?: number
  dis?: number | null
}): PortalItem {
  const { stage, qty = 1, deliv = 0, rework = 0 } = opts
  return {
    id: 0, so: 'SO-1', proj: 'P', cust: 'C', pm: 'PM', grp: 'G', code: 'CODE', name: 'Name',
    hold: 0, qty, deliv, remain: qty - deliv,
    rate: 100, contract: 100, backlog: 100, dvalue: 0,
    soDate: '2026-07-27', cDate: null, cPeriod: 60,
    rework,
    ch: ['2026-07-27'],
    nIA: 1, nRev: 0, nRel: 1,
    T: [null, null, null, null, null, null, null, null],
    age: 26, dtc: null, late: 0, pct: 0,
    st: [gap('x'), gap('x'), gap('x'), gap('x'), gap('x'), gap('x'), gap('x')],
    nextStage: 'x', nextStatus: 'x',
    stage,
    step: 'In production',
    stepCode: null,
    since: '2026-08-12',
    dis: opts.dis === undefined ? 10 : opts.dis,
    mainWos: 1,
    sd: opts.sd ?? noDates(),
  }
}

test('the bar reproduces the worked example from the spec', () => {
  // Mockup 2, SO-26-00309: ordered 27 Jul, drawings sent 12 Aug, now with the
  // customer. The bar reads "Drawing Creation · 16d" then "Drawings Approval ·
  // with you · 6d", against a today of 18 Aug.
  const sd = noDates()
  sd[SLOT.soCreated] = '2026-07-27'
  sd[SLOT.soSubmitted] = '2026-07-27'
  sd[SLOT.rfdSubmitted] = '2026-08-12'
  const bands = buildBands(panel({ stage: 2, sd }), '2026-08-18')

  assert.deepEqual(
    bands.map((b) => [b.label, b.from, b.to]),
    [
      ['Drawing Creation', '2026-07-27', '2026-08-12'],
      ['Waiting for approval to proceed', '2026-08-12', '2026-08-18'],
    ],
  )
  assert.ok(bands[1]!.open, 'the last one is still running')
  assert.ok(bands[1]!.withYou, 'and it is the customer who is holding it')
})

test('order creation draws nothing, because it is a moment not a span', () => {
  const sd = noDates()
  sd[SLOT.soCreated] = '2026-07-27'
  sd[SLOT.soSubmitted] = '2026-07-27'
  const bands = buildBands(panel({ stage: 1, sd }), TODAY)
  assert.ok(!bands.some((b) => b.label === 'Order Creation'))
})

test('a segment runs from where the last stage ended, not from its own first date', () => {
  // The defect this fixes: taking each stage's own start made every stage that
  // records a single date zero pixels wide, and drew an empty bar for all 647
  // delivered items.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2025-11-12' // order submitted
  sd[SLOT.relSubmitted] = '2025-11-19' // design verified
  sd[SLOT.productionClosed] = '2026-05-24' // production completed
  const bands = buildBands(panel({ stage: 11, qty: 1, deliv: 1, sd }), TODAY)

  assert.ok(bands.length > 0, 'a delivered item must draw something')
  assert.equal(bands[0]!.from, '2025-11-12', 'starting where the order was placed')
  for (const b of bands) assert.ok(b.to > b.from, `${b.label} has no width`)
})

test('segments never overlap and never run backwards', () => {
  // Production dates can arrive out of order. A bar drawn backwards is worse than
  // no bar: it reads as the panel having gone into reverse.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-03-01'
  sd[SLOT.relSubmitted] = '2026-02-01' // earlier than the stage before it
  sd[SLOT.productionClosed] = '2026-04-01'
  const bands = buildBands(panel({ stage: 11, qty: 1, deliv: 1, sd }), TODAY)
  for (let i = 0; i < bands.length; i += 1) {
    assert.ok(bands[i]!.to >= bands[i]!.from, 'no segment runs backwards')
    if (i > 0) assert.ok(bands[i]!.from >= bands[i - 1]!.to, 'no segment overlaps the last')
  }
})

test('a stage that recorded nothing has its time absorbed by the one that closed it', () => {
  // We know the work was finished by that date and not when it began. Attributing
  // the gap to the stage that ended it is the reading that invents no boundary.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01' // order submitted
  sd[SLOT.productionClosed] = '2026-06-01' // production completed; everything between recorded nothing
  const bands = buildBands(panel({ stage: 11, qty: 1, deliv: 1, sd }), TODAY)
  const manufacturing = bands.find((b) => b.label === 'Manufacturing')!
  assert.equal(manufacturing.from, '2026-01-01')
  assert.equal(manufacturing.to, '2026-06-01')
  assert.ok(!bands.some((b) => b.label === 'Material Planning'), 'no invented boundary')
})

test('only the running stage is open, and it is always the last', () => {
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-07-27'
  sd[SLOT.rfdSubmitted] = '2026-08-12'
  const bands = buildBands(panel({ stage: 6, sd }), TODAY)
  const open = bands.filter((b) => b.open)
  assert.equal(open.length, 1)
  assert.equal(open[0], bands[bands.length - 1])
  assert.equal(open[0]!.to, TODAY, 'it runs up to today')
})

test('a fully delivered item has no open segment', () => {
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.delivered] = '2026-06-01'
  const bands = buildBands(panel({ stage: 11, qty: 2, deliv: 2, sd }), TODAY)
  assert.ok(bands.every((b) => !b.open), 'nothing is still running on a shipped panel')
})

/* ------------------------------------------------------------- families -- */

test('finished stages of one family fold into a single named band', () => {
  // Mockup 3: "Drawings · 33d" is Drawing Creation, Drawings Approval and Design
  // Verification added together. Eleven bands is a barcode; five is a shape.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-02-04' // order submitted
  sd[SLOT.rfdSubmitted] = '2026-02-20' // sent for approval
  sd[SLOT.relCreated] = '2026-03-01' // approved
  sd[SLOT.woSubmitted] = '2026-03-09' // work order released — end of the drawings family
  sd[SLOT.materialChecked] = '2026-03-14' // material planning closed
  sd[SLOT.materialAvailable] = '2026-04-23' // material fully available
  sd[SLOT.productionClosed] = '2026-06-08' // production completed
  const bands = buildBands(panel({ stage: 11, qty: 1, deliv: 1, sd }), TODAY)

  const drawings = bands.find((b) => b.label === 'Drawings')!
  assert.equal(drawings.from, '2026-02-04')
  assert.equal(drawings.to, '2026-03-09', 'through to the last drawings stage')
  assert.ok(drawings.spans > 1)
  assert.equal(drawings.family.hex, '#5C6B57', "the spec's own colour")

  assert.ok(bands.some((b) => b.label === 'Material'))
  assert.ok(bands.some((b) => b.label === 'Manufacturing'))
})

test('a band covering one stage keeps the name of that stage', () => {
  // Both readings are in the spec: Mockup 2 says "Drawing Creation · 16d" where
  // only that stage has finished, Mockup 3 says "Drawings · 33d" where all three
  // have. What separates them is how much the band actually covers.
  const sd = noDates()
  sd[SLOT.soCreated] = '2026-07-27'
  sd[SLOT.soSubmitted] = '2026-07-27'
  sd[SLOT.rfdSubmitted] = '2026-08-12'
  const bands = buildBands(panel({ stage: 2, sd }), '2026-08-18')
  const first = bands[0]!
  assert.equal(first.label, 'Drawing Creation')
  assert.equal(first.spans, 1)
})

test('a band that swallowed a silent stage is named for the family', () => {
  // Material Planning records nothing, so the band closing on material-ready
  // covers both. Calling it "Material Readiness" would credit the whole wait to
  // whichever stage happened to write the closing date.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.materialAvailable] = '2026-03-01' // material fully available; planning recorded nothing
  const bands = buildBands(panel({ stage: 6, sd }), TODAY)
  const material = bands.find((b) => b.family.key === 'material')!
  assert.equal(material.label, 'Material')
  assert.ok(material.spans > 1)
})

test('the running stage is never folded into a family', () => {
  // It is the answer to "where is my panel". Burying it inside a family would
  // lose the one band the reader came for.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-07-27'
  sd[SLOT.rfdSubmitted] = '2026-08-01' // drawing creation closed
  sd[SLOT.relCreated] = '2026-08-12' // approval closed, design verification opened
  const bands = buildBands(panel({ stage: 3, sd }), '2026-08-18')
  const open = bands.find((b) => b.open)!
  assert.equal(open.label, 'Design Verification', 'its own name, not "Drawings"')
  assert.equal(open.family.key, 'drawings', 'though it still takes the family colour')
})

test('every family colour is the one the spec specifies', () => {
  const want: Record<string, string> = {
    none: '#B8B2A7',
    drawings: '#5C6B57',
    material: '#7A5230',
    manufacturing: '#96602F',
    quality: '#A87038',
    delivery: '#2E7D53',
  }
  for (const [key, hex] of Object.entries(want)) {
    assert.equal(FAMILIES.find((f) => f.key === key)!.hex, hex, key)
  }
})

test('no segment carries the phase vocabulary the bar used to speak', () => {
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.productionClosed] = '2026-06-01'
  for (const b of buildBands(panel({ stage: 11, qty: 1, deliv: 1, sd }), TODAY)) {
    assert.ok(!/^T\d/.test(b.label), `"${b.label}" is a T-phase name`)
    assert.ok(!/rework/i.test(b.label), `"${b.label}" says rework`)
  }
})
