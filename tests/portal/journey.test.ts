/**
 * The stage cards, and the steps inside them.
 *
 * The model changed shape twice. It used to infer the current stage from a chain
 * of timestamps; it now reads the report's `Current Stage #`, because that rule
 * lives in SQL and a second copy drifts. And it used to draw one card per
 * milestone; it now draws one card per stage, with the stage's steps listed inside.
 *
 * So these tests cover presentation, the two omissions Powerline asked for — the
 * idle "Waiting for…" step and the Financial Check stage — and the invariant that
 * matters most: a date is never shown for something the report cannot evidence.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { journeyOf } from '@/portal/journey'
import {
  SLOT,
  STAGES,
  STAGE_WEIGHTS,
  STEP_SLOTS,
  stagePosition,
  stagesFor,
  stepWording,
  visibleStageOf,
  weightedProgress,
} from '@/portal/milestones'
import { STATE, type PortalItem, type Stage } from '@/portal/types'

const TODAY = '2026-08-22'
const gap = (status: string): Stage => [STATE.gap, status, null, null, null]
const noDates = () => Array.from({ length: STEP_SLOTS }, () => null) as (string | null)[]

/** A panel sitting on `stage`, with whatever step dates the caller supplies. */
function panel(opts: {
  stage: number
  step?: string | null
  qty?: number
  deliv?: number
  rework?: number
  dis?: number | null
  sd?: (string | null)[]
}): PortalItem {
  const { stage, qty = 1, deliv = 0, rework = 0 } = opts
  return {
    id: 0, so: 'SO-1', proj: 'P', cust: 'C', pm: 'PM', grp: 'G', code: 'CODE', name: 'Name',
    hold: 0, qty, deliv, remain: qty - deliv,
    rate: 100, contract: 100 * qty, backlog: 100 * (qty - deliv), dvalue: 100 * deliv,
    soDate: '2026-01-01', cDate: '2026-12-01', cPeriod: 60,
    rework,
    ch: ['2026-01-01'],
    nIA: 1, nRev: 0, nRel: 1,
    T: [null, null, null, null, null, null, null, null],
    age: 100, dtc: 10, late: 0, pct: 0,
    st: [gap('x'), gap('x'), gap('x'), gap('x'), gap('x'), gap('x'), gap('x')],
    nextStage: 'x', nextStatus: 'x',
    stage,
    step: opts.step === undefined ? 'In production' : opts.step,
    stepCode: null,
    since: '2026-08-01',
    dis: opts.dis === undefined ? 21 : opts.dis,
    mainWos: 1,
    sd: opts.sd ?? noDates(),
  }
}

/* ------------------------------------------------ what is and is not drawn -- */

test('no card exposes the accounts workflow', () => {
  // v8 removed Financial Check from the model outright. The report still emits it
  // as stage 10 for 119 open lines, so the guard is about what those lines render
  // as, not about a card that could still be declared somewhere.
  for (const stage of [0, 4, 8, 10, 11]) {
    const j = journeyOf(panel({ stage }), TODAY)
    assert.ok(!j.some((s) => /financial|accounts|invoice|payment/i.test(s.label + s.team)))
    assert.ok(!j.some((s) => s.steps.some((x) => /pending accounts/i.test(x.label))))
  }
})

test('the report’s Financial Check maps onto v8’s Delivery', () => {
  /* v8 removed Financial Check; the SQL has not been renumbered and still emits it
     as 10, with Delivery Readiness at 11. Both mean the same thing to a customer,
     so both map to v8's Delivery. This is column normalisation — the mapping v8
     itself defines — not a decision about status. */
  assert.equal(visibleStageOf(10), 10)
  assert.equal(visibleStageOf(11), 10)
  for (let n = 0; n <= 9; n += 1) assert.equal(visibleStageOf(n), n)

  // and the card at that position is the Delivery card, whatever its fields say
  for (const reportStage of [10, 11]) {
    const j = journeyOf(panel({ stage: reportStage }), TODAY)
    assert.equal(j[j.length - 1]!.n, 10)
    assert.equal(j[j.length - 1]!.label, 'Delivery')
  }
})

test('the modification stage is hidden unless the item is in rework', () => {
  const clean = journeyOf(panel({ stage: 6 }), TODAY)
  assert.ok(!clean.some((s) => s.n === 9))
  assert.equal(clean.length, stagesFor(false).length)

  const reworked = journeyOf(panel({ stage: 9, rework: 1 }), TODAY)
  const mod = reworked.find((s) => s.n === 9)!
  assert.equal(mod.state, 'active')
  assert.equal(mod.status, 'Item under modification')
  assert.ok(!/rework/i.test(mod.label), 'never the word rework')
})

test('the strip is ten stages, or eleven with a modification', () => {
  assert.equal(stagesFor(false).length, 10, 'twelve, less Financial Check and modification')
  assert.equal(stagesFor(true).length, 11)
})

/* ---------------------------------------------------------- what it says -- */

/* The old "only one stage is ever active" test lived here. Under the mapping the
   report's Current Stage no longer decides a card's status, so the property is not
   the portal's to guarantee — where the source disagrees with itself the journey
   shows it, and `npm run provenance` counts it. */


test('a step shows its own start and end', () => {
  // v8 gives Order Creation one step spanning both dates, where the old model had
  // two steps each carrying one. A step now knows when it opened and when it shut,
  // which is what the card state is read from.
  const sd = noDates()
  sd[SLOT.soCreated] = '2026-07-24'
  sd[SLOT.soSubmitted] = '2026-07-27'
  const order = journeyOf(panel({ stage: 2, sd }), TODAY).find((s) => s.n === 0)!
  assert.deepEqual(order.steps.map((x) => x.no), [0])
  assert.equal(order.steps[0]!.started, '2026-07-24')
  assert.equal(order.steps[0]!.ended, '2026-07-27')
  assert.equal(order.steps[0]!.on, '2026-07-27', 'the date shown is the conclusion')
  assert.ok(order.steps.every((x) => x.done))
})

test('no card carries an idle "waiting for" step', () => {
  // Removed at Powerline's request. Every step on a card is a real step with a
  // number and a column behind it.
  for (const stage of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]) {
    for (const s of journeyOf(panel({ stage, rework: 1 }), TODAY)) {
      for (const step of s.steps) {
        // v8 numbers the first step 0, so presence is the test, not positivity.
        assert.ok(Number.isInteger(step.no), `"${step.label}" has no step number`)
        assert.ok(!/^waiting for/i.test(step.label), `"${step.label}" is an idle step`)
      }
    }
  }
})

test('the badge counts the stages actually shown, with no holes', () => {
  // v8 numbers 0–10 with no gap, but a modification is optional, so a clean panel
  // shows ten cards and Delivery is the tenth — not the eleventh its stage number
  // would suggest.
  const clean = journeyOf(panel({ stage: 6 }), TODAY)
  assert.deepEqual(clean.map((s) => s.pos), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(clean.find((s) => s.n === 10)!.pos, 10, 'Delivery is the tenth card')

  const reworked = journeyOf(panel({ stage: 9, rework: 1 }), TODAY)
  assert.deepEqual(reworked.map((s) => s.pos), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
})

test('the header, the table and the cards number the stages the same way', () => {
  /* `stagePosition` answers "which card is this, counting from one" and is used by
     the header line, the item table and the cards. It reads `Current Stage #` and
     nothing else — the check is that the three agree on the arithmetic, not that a
     card's status matches, which now comes from a different field entirely. */
  for (const [stage, rework] of [[0, 0], [4, 0], [9, 1], [10, 0], [11, 1]] as const) {
    const j = journeyOf(panel({ stage, rework }), TODAY)
    const pos = stagePosition(stage, rework > 0)
    const card = j[pos - 1]
    assert.ok(card, `position ${pos} has no card for report stage ${stage}`)
    assert.equal(card!.pos, pos)
  }
})

test('FAT is one step, not two', () => {
  // v8 collapsed it. The previous model drew FAT Invitation and FAT Success as
  // separate steps standing on the same date, because the invitation field does
  // not exist — two rows showing one day is not evidence of two events, and v8
  // says to use FAT success for both until the field is built.
  const fat = journeyOf(panel({ stage: 8 }), TODAY).find((s) => s.n === 8)!
  assert.deepEqual(fat.steps.map((x) => x.no), [9])
  assert.equal(fat.steps[0]!.label, 'FAT')
})

test('the FAT step reads its dates from the columns v8 names', () => {
  /* v8: FAT starts when Testing Status reads Touchup or Completed and ends when
     the Transfer To Finished Goods entry is submitted. Those are display dates;
     the state comes from the report's stage. */
  const sd = noDates()
  sd[SLOT.testingDone] = '2026-06-01'
  sd[SLOT.fatSuccess] = '2026-06-03'
  const fat = journeyOf(panel({ stage: 10, sd }), TODAY).find((s) => s.n === 8)!
  assert.equal(fat.steps[0]!.started, '2026-06-01')
  assert.equal(fat.steps[0]!.ended, '2026-06-03')
  assert.equal(fat.state, 'done', 'behind the frontier')
})

test('a stage the item has not reached shows no dates, even where one exists', () => {
  // 25 open lines carry a testing-completed date with no testing-started date, so
  // the ladder leaves them behind while a later column is already filled. The
  // ladder is the authority. See docs/SPEC-AUDIT.md §3.6.
  const sd = noDates()
  sd[10] = '2025-04-10' // 11 Quality Check in Progress
  const quality = journeyOf(panel({ stage: 6, sd }), TODAY).find((s) => s.n === 7)!
  assert.equal(quality.state, 'pending')
  assert.equal(quality.to, null)
  assert.ok(quality.steps.every((x) => x.on === null), 'no date above the frontier')
})

test('a completed stage with no date says so rather than inventing one', () => {
  const j = journeyOf(panel({ stage: 8 }), TODAY)
  for (const s of j.filter((x) => x.state === 'done')) {
    assert.equal(s.status, 'Not recorded')
    assert.equal(s.to, null)
  }
})

test('the approval stage is titled "waiting" only while it is the one waiting', () => {
  // Waiting means the report says the item is at Drawings Approval.
  const waiting = journeyOf(panel({ stage: 2 }), TODAY).find((s) => s.n === 2)!
  assert.equal(waiting.label, 'Waiting for approval to proceed')
  assert.equal(waiting.status, 'Pending Approval')
  assert.equal(waiting.team, 'Customer', 'the card says whose court the ball is in')

  const past = journeyOf(panel({ stage: 6 }), TODAY).find((s) => s.n === 2)!
  assert.equal(past.label, 'Drawings Approval')
})

test('the running counter comes from the report, not from a local clock', () => {
  // `Days In Current Stage`, read, for the stage the report names.
  const j = journeyOf(panel({ stage: 4, dis: 137 }), TODAY)
  assert.equal(j.find((s) => s.n === 4)!.days, 137)
})

test('the material check reports what it found, not just that it happened', () => {
  const sd = noDates()
  sd[SLOT.materialChecked] = '2026-05-08'
  const it = { ...panel({ stage: 4, sd }), matStatus: 'Partially Available' }
  const check = journeyOf(it, TODAY).find((s) => s.n === 4)!
  assert.equal(check.steps.find((x) => x.no === 5)!.note, 'Partially Available')
})

test('a fully delivered item is complete throughout, with no active stage', () => {
  // Quantities say it shipped, so the journey is finished — no stamps required.
  const j = journeyOf(panel({ stage: 10, qty: 4, deliv: 4 }), TODAY)
  assert.ok(
    j.every((s) => s.state === 'done'),
    j.map((s) => `${s.n}:${s.state}`).join(' '),
  )
  assert.equal(j[j.length - 1]!.status, 'Delivered')
})

test('a part-shipped item says partially delivered, not delivered', () => {
  // Part-shipped: the stage has reached Delivery but the quantities have not.
  const j = journeyOf(panel({ stage: 10, qty: 4, deliv: 1 }), TODAY)
  assert.equal(j[j.length - 1]!.status, 'Partially delivered')
})

/* ------------------------------------------------------------ progress -- */

test('the weights sum to 100, so a finished item reads exactly 100%', () => {
  assert.equal(
    STAGE_WEIGHTS.reduce((a, b) => a + b, 0),
    100,
  )
})

test('progress is the weight of what is finished, not the index of where it is', () => {
  // The defect this replaces: every open item read 10% at milestone 3 of 9.
  assert.equal(weightedProgress(0, false), 0)
  assert.equal(weightedProgress(2, false), 15)
  assert.equal(weightedProgress(7, false), 75)
  // v8's Delivery is stage 10; everything before it sums to 90.
  assert.equal(weightedProgress(10, false), 90)
  // The report has not been renumbered, so 11 still arrives and must not overrun.
  assert.equal(weightedProgress(11, false), 90)
  assert.equal(weightedProgress(11, true), 100)
})

test('a modification holds the percentage rather than moving it backwards', () => {
  const atFat = weightedProgress(8, false)
  const during = weightedProgress(9, false)
  const after = weightedProgress(10, false)
  assert.ok(during >= atFat)
  assert.equal(after - during, 0, 'the loop itself is not progress')
})

/* ------------------------------------------------------------- wording -- */

test('no internal step name reaches the customer', () => {
  assert.ok(!/accounts/i.test(stepWording('Delivery Note Issued - Pending Accounts')!))
  assert.ok(!/rework/i.test(stepWording('Item Under Modification')!))
})

test('an unrecognised step is passed through rather than blanked', () => {
  assert.equal(stepWording('Something New'), 'Something New')
  assert.equal(stepWording(null), null)
})

test('the stage model and the step slots agree', () => {
  // Every slot is claimed by exactly one end of one step. Under v8 a step owns two
  // slots — a start and an end — because a card's state is read off both.
  const declared = new Set(
    STAGES.flatMap((s) => s.steps).flatMap((s) => [s.startAt, s.endAt]),
  )
  assert.deepEqual(
    [...declared].sort((a, b) => a - b),
    Array.from({ length: STEP_SLOTS }, (_, i) => i),
    'every slot is claimed, and none is claimed that does not exist',
  )
})
