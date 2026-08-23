/**
 * The v8 stage model, and the one rule that makes it different.
 *
 * v8's substance is that a card is read from its own two fields rather than from
 * the item's single ladder position. That is what allows Material Readiness and
 * Manufacturing to be in progress at the same time — production starts on
 * partially available material while procurement keeps buying — which a ladder
 * cannot express, because a ladder has one rung.
 *
 * The tests below fix both halves: the shape of the model against the spreadsheet,
 * and the state machine against the cases where the date rule and the ladder
 * disagree.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildBands } from '@/portal/bands'
import { journeyOf } from '@/portal/journey'
import {
  AWAITING_APPROVAL_STAGE,
  PARALLEL_PAIR,
  SLOT,
  STAGES,
  STEP_NO_BY_CODE,
  STAGE_DELIVERY,
  STAGE_WEIGHTS,
  stageState,
  stagesFor,
  stepWording,
  v8StageOf,
} from '@/portal/milestones'
import { STATE, type PortalItem, type Stage } from '@/portal/types'

const TODAY = '2026-08-22'
const gap = (): Stage => [STATE.gap, 'x', null, null, null]
const noDates = () => Array.from({ length: 18 }, () => null) as (string | null)[]

function panel(o: {
  stage: number
  sd?: (string | null)[]
  rework?: number
  mainWos?: number
  stepCode?: number | null
  qty?: number
  deliv?: number
}): PortalItem {
  return {
    id: 0, so: 'SO-1', proj: 'P', cust: 'C', pm: 'PM', grp: 'G', code: 'C1', name: 'N',
    hold: 0, qty: o.qty ?? 1, deliv: o.deliv ?? 0, remain: 1,
    rate: 1, contract: 1, backlog: 1, dvalue: 0,
    soDate: '2026-01-01', cDate: '2026-12-01', cPeriod: 60,
    wo: 'WO-1', woQty: 1, prodQty: 0, woStatus: 'In Process', matStatus: null,
    rework: o.rework ?? 0, rwStatus: undefined, ch: [], nIA: 1, nRev: 0, nRel: 1,
    T: [null, null, null, null, null, null, null, null],
    age: 100, dtc: 10, late: 0, pct: 0,
    st: [gap(), gap(), gap(), gap(), gap(), gap(), gap()],
    nextStage: null, nextStatus: null,
    stage: o.stage, step: null, stepCode: o.stepCode ?? null,
    since: null, dis: 5, mainWos: o.mainWos ?? 1,
    sd: o.sd ?? noDates(),
  } as unknown as PortalItem
}

/* ------------------------------------------------------- the model's shape -- */

test('the model is v8: eleven stages, 0 to 10, no gap', () => {
  assert.deepEqual(STAGES.map((s) => s.no), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(STAGE_DELIVERY, 10)
})

test('the stage names and owning teams are the spreadsheet’s', () => {
  assert.deepEqual(
    STAGES.map((s) => [s.no, s.name, s.team]),
    [
      [0, 'Order Creation', 'Sales Team'],
      [1, 'Drawing Creation', 'Design'],
      [2, 'Drawings Approval', 'Customer'],
      [3, 'Design Verification', 'Design'],
      [4, 'Material Planning', 'Planning'],
      [5, 'Material Readiness', 'Procurement'],
      [6, 'Manufacturing', 'Production'],
      [7, 'Quality', 'Quality'],
      [8, 'FAT', 'Project Management'],
      // v8's Stage Name column reads "Rework". Its Customer-facing Label does not,
      // and the label is what a card shows.
      [9, 'Item Under Modification', 'Project Management'],
      [10, 'Delivery', 'Deliveries'],
    ],
  )
})

test('the step numbers and customer-facing labels are the spreadsheet’s', () => {
  // Twelve steps, numbered 0–10 then 12: v8 removed the old step 11, "Delivery
  // Note issued — pending accounts", as internal and did not renumber the rest.
  assert.deepEqual(
    STAGES.flatMap((s) => s.steps).map((x) => [x.no, x.label]),
    [
      [0, 'Order Activation'],
      [1, 'Drawing preparation'],
      [2, 'Customer Approval'],
      [3, 'Design Verified'],
      [4, 'Work Order Release'],
      [5, 'Material Checked'],
      [6, 'Material Readiness'],
      [7, 'Manufacturing'],
      [8, 'Quality check'],
      [9, 'FAT'],
      [10, 'Item Under Modification'],
      [12, 'Delivery'],
    ],
  )
})

test('FAT is one step, because only one of its two dates exists', () => {
  const fat = STAGES.find((s) => s.no === 8)!
  assert.equal(fat.steps.length, 1)
})

test('no stage or step reaches a screen carrying internal vocabulary', () => {
  const surfaces = STAGES.flatMap((s) => [s.name, s.team, ...s.steps.map((x) => x.label)])
  for (const word of [/\brework\b/i, /accounts/i, /invoice/i, /payment/i, /not approved/i]) {
    const hit = surfaces.find((t) => word.test(t))
    assert.equal(hit, undefined, `"${hit}" is internal wording`)
  }
})

test('the weights still sum to 100 across eleven stages', () => {
  assert.equal(STAGE_WEIGHTS.length, 11)
  assert.equal(STAGE_WEIGHTS.reduce((a, b) => a + b, 0), 100)
})

/* ------------------------------------------- the report has not caught up -- */

test('the report’s old ladder is translated, not trusted blindly', () => {
  // v8 removed Financial Check and made Delivery 10. The SQL still emits 10 for
  // Financial Check and 11 for Delivery Readiness. Reading a raw 10 as Delivery
  // would tell 119 open lines they are shipping when they are parked before it.
  for (let n = 0; n <= 9; n += 1) assert.equal(v8StageOf(n), n, `stage ${n} is unchanged`)
  assert.equal(v8StageOf(10), STAGE_DELIVERY, 'Financial Check becomes Delivery')
  assert.equal(v8StageOf(11), STAGE_DELIVERY, 'so does Delivery Readiness')
})

/* ------------------------------------------------- the report is the truth -- */

/*
 * `current_stage_#` decides every card. Dates supply the days to print and
 * nothing else. The four tests below are the whole contract, and each one exists
 * because the opposite behaviour was shipped at some point and broke real lines.
 */

test('1. a stage before the current one is Completed, even with no date at all', () => {
  /* The export's Work Order date fields were backfilled once and never updated,
     so a passed stage frequently carries nothing. Reading that as "not started"
     put an empty card above a finished one on 869 of 1303 real lines. */
  assert.equal(stageState(2, 6, false, { start: null, end: null }), 'done')
  assert.equal(stageState(0, 10, false, { start: null, end: null }), 'done')

  const sd = noDates() // not one stamp anywhere
  const j = journeyOf(panel({ stage: 6, sd }), TODAY)
  for (const st of j.filter((x) => x.n < 6)) {
    assert.equal(st.state, 'done', `stage ${st.n} is behind the frontier`)
    assert.equal(st.to, null, 'and shows no date, rather than an invented one')
  }
})

test('2. a stage after the current one is Not Started, even carrying a date', () => {
  // A document touched early is not an arrival. 296 real lines carry stamps past
  // their reported stage.
  assert.equal(stageState(7, 6, false, { start: '2026-03-01', end: '2026-03-09' }), 'pending')

  const sd = noDates()
  sd[SLOT.testingStarted] = '2026-05-01'
  sd[SLOT.testingDone] = '2026-05-09' // Quality stamped while the report says stage 4
  const quality = journeyOf(panel({ stage: 4, sd }), TODAY).find((x) => x.n === 7)!
  assert.equal(quality.state, 'pending')
})

test('3. the stage the report names is the one In Progress', () => {
  assert.equal(stageState(6, 6, false, { start: null, end: null }), 'active')
  assert.equal(stageState(6, 6, false, { start: '2026-01-01', end: '2026-02-01' }), 'active')

  const j = journeyOf(panel({ stage: 6, sd: noDates() }), TODAY)
  const lit = j.filter((x) => x.state === 'active')
  assert.deepEqual(lit.map((x) => x.n), [6])
})

test('4. no later stage is Completed above an earlier one that is not', () => {
  /* The invariant, over every position the report can report, with a stamp
     deliberately planted out of order to try to break it. */
  const order = { done: 0, active: 1, pending: 2 } as const
  for (const reportStage of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) {
    const sd = noDates()
    sd[SLOT.fatSuccess] = '2026-06-01' // a stamp near the end, whatever the stage
    const seq = journeyOf(panel({ stage: reportStage, sd }), TODAY).map((x) => x.state)
    let worst = 0
    for (const st of seq) {
      assert.ok(order[st] >= worst, `stage ${reportStage}: ${seq.join(' ')}`)
      worst = Math.max(worst, order[st])
    }
  }
})

/* --------------------------------------------------------- the step rule -- */

test('5. the current step comes from step_code, not from matching text', () => {
  // Design Verification holds two steps. Which is running is decided by the code.
  const atVerify = journeyOf(panel({ stage: 3, stepCode: 5 }), TODAY).find((x) => x.n === 3)!
  assert.deepEqual(atVerify.steps.map((x) => [x.no, x.state]), [[3, 'active'], [4, 'pending']])

  const atRelease = journeyOf(panel({ stage: 3, stepCode: 6 }), TODAY).find((x) => x.n === 3)!
  assert.deepEqual(atRelease.steps.map((x) => [x.no, x.state]), [[3, 'done'], [4, 'active']])
})

test('6. step_code 90 is the modification, not step 9', () => {
  /* The report numbers both 9 in `current_step_#`; only the code separates them,
     which is why the portal keys on the code. */
  assert.equal(STEP_NO_BY_CODE[9], 7, 'code 9 is Production')
  assert.equal(STEP_NO_BY_CODE[90], 10, 'code 90 is the modification')

  const mod = journeyOf(panel({ stage: 9, rework: 1, stepCode: 90 }), TODAY).find((x) => x.n === 9)!
  assert.equal(mod.state, 'active')
  assert.equal(mod.label, 'Item Under Modification')
  assert.ok(!/rework/i.test(mod.label + mod.status), 'and never says rework')
})

test('a step is never Completed above an unfinished step in the same stage', () => {
  for (const code of [5, 6]) {
    const dv = journeyOf(panel({ stage: 3, stepCode: code }), TODAY).find((x) => x.n === 3)!
    let open = false
    for (const sp of dv.steps) {
      assert.ok(!(sp.done && open), `step ${sp.no} done above an open one`)
      if (!sp.done) open = true
    }
  }
})

/* ------------------------------------------------------- the PARALLEL RULE -- */

test('Material Readiness and Manufacturing are the pair v8 allows to overlap', () => {
  assert.deepEqual([...PARALLEL_PAIR], [5, 6])
})

test('Material Readiness keeps running while Manufacturing has started', () => {
  // v8: "Card 6 stays In Progress until main_available_on fills. Card 7 goes In
  // Progress the moment main_production_started fills. BOTH can read In Progress
  // at the same time — that is correct, not a bug."
  const sd = noDates()
  sd[SLOT.materialChecked] = '2026-03-01' // procurement started buying
  sd[SLOT.productionStarted] = '2026-04-01' // the floor started building
  // main_available_on and main_closed are both still empty

  const j = journeyOf(panel({ stage: 6, sd }), TODAY)
  assert.equal(j.find((s) => s.n === 5)!.state, 'active', 'procurement is still buying')
  assert.equal(j.find((s) => s.n === 6)!.state, 'active', 'and the floor is already building')
})

test('the overlap is labelled on both cards, so it does not read as a fault', () => {
  const sd = noDates()
  sd[SLOT.materialChecked] = '2026-03-01'
  sd[SLOT.productionStarted] = '2026-04-01'
  const j = journeyOf(panel({ stage: 6, sd }), TODAY)
  assert.equal(j.find((s) => s.n === 5)!.alongside, 6)
  assert.equal(j.find((s) => s.n === 6)!.alongside, 5)
})

test('material finishing ends the overlap and leaves one card running', () => {
  const sd = noDates()
  sd[SLOT.materialChecked] = '2026-03-01'
  sd[SLOT.materialAvailable] = '2026-05-01' // everything arrived
  sd[SLOT.productionStarted] = '2026-04-01'
  const j = journeyOf(panel({ stage: 6, sd }), TODAY)
  assert.equal(j.find((s) => s.n === 5)!.state, 'done')
  assert.equal(j.find((s) => s.n === 6)!.state, 'active')
  assert.equal(j.find((s) => s.n === 5)!.alongside, undefined, 'no overlap to explain')
})

test('the overlap never draws two live segments on the bar', () => {
  // The bar measures elapsed time. Two open segments would double-count the same
  // fortnight and invent a duration for whichever stage did not own it.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.materialChecked] = '2026-03-01'
  sd[SLOT.productionStarted] = '2026-04-01'
  const bands = buildBands(panel({ stage: 6, sd }), TODAY)
  assert.equal(bands.filter((b) => b.open).length, 1, 'exactly one running segment')
})

test('an open line whose stages have all closed still shows the time since', () => {
  /* The report puts this item at FAT and FAT's end date is stamped. 69 real open
     lines were in that shape, and the bar used to stop at the last stamp — one of
     them saying nothing about 696 days.

     What fixes it is the ladder: the stage the report points at is running, so it
     is drawn running, whatever its own end date says. The assertion is the outcome
     rather than the mechanism, because a "No update recorded" tail would satisfy it
     equally well and both are correct answers. */
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.testingDone] = '2026-02-01'
  sd[SLOT.fatSuccess] = '2026-02-20'
  const bands = buildBands(panel({ stage: 8, sd }), TODAY)
  const last = bands[bands.length - 1]!
  assert.equal(last.to, TODAY, 'the bar reaches today')
  assert.equal(last.open, true, 'and says so')
  // exactly one live segment, so no stretch of time is counted twice
  assert.equal(bands.filter((b) => b.open).length, 1)
})



test('a delivered line stops at delivery rather than running to today', () => {
  // The counterpart: a finished order has no unaccounted time, and drawing one
  // would say the panel is still somewhere.
  const sd = noDates()
  sd[SLOT.soSubmitted] = '2026-01-01'
  sd[SLOT.delivered] = '2026-03-01'
  const it = { ...panel({ stage: 10, sd }), qty: 1, deliv: 1 } as PortalItem
  const bands = buildBands(it, TODAY)
  assert.equal(bands.some((b) => b.label === 'No update recorded'), false)
  assert.equal(bands.some((b) => b.open), false)
})

/* ------------------------------------------------- steps carry their state -- */

test('with no step code the first step is running and the rest are not', () => {
  /* Every real row carries a code, but the portal must not fall back to reading
     the dates when one is missing — that is the second engine this design exists
     to avoid. It assumes the least instead: the stage has been reached. */
  const dv = journeyOf(panel({ stage: 3, stepCode: null }), TODAY).find((s) => s.n === 3)!
  assert.deepEqual(dv.steps.map((x) => [x.no, x.state]), [[3, 'active'], [4, 'pending']])
})

/* --------------------------------------------- wording stays customer-safe -- */

test('the report’s internal step strings are translated, never passed through', () => {
  assert.equal(stepWording('Rework'), 'Item under modification')
  assert.equal(stepWording('Delivery Note Issued - Pending Accounts'), 'Preparing for dispatch')
  for (const raw of ['Rework', 'Delivery Note Issued - Pending Accounts']) {
    assert.ok(!/rework|accounts/i.test(stepWording(raw)!), `"${raw}" leaked`)
  }
})

test('a modification card appears only when one was actually raised', () => {
  assert.equal(stagesFor(false).some((s) => s.no === 9), false)
  assert.equal(stagesFor(true).some((s) => s.no === 9), true)
  assert.equal(stagesFor(false).length, 10)
  assert.equal(stagesFor(true).length, 11)
})

test('the approval stage is still the one the customer owns', () => {
  assert.equal(AWAITING_APPROVAL_STAGE, 2)
  assert.equal(STAGES[2]!.team, 'Customer')
})

/* ------------------------------------------- the states the brief names -- */

test('8. a partially delivered line stays partial, whatever stage it reached', () => {
  /* Quantities decide the delivery label, not the stage. An order can reach
     Delivery with one of four panels shipped, and calling that Delivered is the
     one error the customer is guaranteed to notice. */
  const part = journeyOf(panel({ stage: 10, qty: 4, deliv: 1 }), TODAY)
  assert.equal(part[part.length - 1]!.status, 'Partially delivered')

  const whole = journeyOf(panel({ stage: 10, qty: 4, deliv: 4 }), TODAY)
  assert.equal(whole[whole.length - 1]!.status, 'Delivered')

  const none = journeyOf(panel({ stage: 10, qty: 4, deliv: 0 }), TODAY)
  assert.ok(!/partial/i.test(none[none.length - 1]!.status))
})

test('9. a delivered line reads Completed throughout on missing history', () => {
  /* The Delivered export carries almost none of the Work Order stamps. Every one
     of its 788 lines would otherwise show a journey of empty stages under a
     shipped panel. */
  const j = journeyOf(panel({ stage: 10, qty: 2, deliv: 2, sd: noDates() }), TODAY)
  assert.ok(j.every((s) => s.state === 'done'), j.map((s) => `${s.n}:${s.state}`).join(' '))
  assert.ok(j.every((s) => s.to === null), 'and invents no dates to justify it')
})

test('10. a line with no work order keeps its order and delivery information', () => {
  // 189 real lines. The production stages have no documents to date them from, so
  // they say so once rather than showing five empty cards.
  const j = journeyOf(panel({ stage: 3, mainWos: 0 }), TODAY)
  for (const n of [4, 5, 6, 7, 8]) {
    assert.equal(j.find((s) => s.n === n)?.unrecorded, true, `stage ${n}`)
  }
  assert.notEqual(j.find((s) => s.n === 0)?.unrecorded, true, 'the order itself is untouched')
  assert.equal(j.length, journeyOf(panel({ stage: 3 }), TODAY).length, 'no stage is hidden')
})

test('11. more than one work order does not overstate completion', () => {
  /* The stage still comes from the report, which aggregates the work orders
     itself. The portal adds nothing per-unit, because the source carries nothing
     per-unit. */
  const many = journeyOf(panel({ stage: 6, mainWos: 3 }), TODAY)
  const one = journeyOf(panel({ stage: 6, mainWos: 1 }), TODAY)
  assert.deepEqual(many.map((s) => s.state), one.map((s) => s.state))
  assert.equal(many.filter((s) => s.state === 'active').length, 1)
})

test('on hold is read from the report and invents no timestamp', () => {
  const held = panel({ stage: 6 })
  assert.equal(held.hold, 0)
  const onHold = { ...held, hold: 1 }
  // The flag is all the report gives; there is no hold-start column to freeze from.
  assert.equal(onHold.hold, 1)
  assert.equal(journeyOf(onHold, TODAY).find((s) => s.n === 6)!.state, 'active')
})
