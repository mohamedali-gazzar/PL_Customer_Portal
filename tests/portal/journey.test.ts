/**
 * The nine-level journey is what a customer reads first, so its two easy mistakes
 * matter: showing several levels as "in progress" at once, and marking a panel that
 * never needed rework as having failed its quality check.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { journeyOf, JOURNEY_LABELS } from '@/portal/journey'
import { STATE, type PortalItem, type Stage } from '@/portal/types'

const TODAY = '2026-08-11'

const gap = (status: string): Stage => [STATE.gap, status, null, null, null]

/** A panel whose chain is filled in up to `through` (0 = order only). */
function panel(opts: {
  chain: (string | null)[]
  fat?: Stage
  delivery?: Stage
  qty?: number
  deliv?: number
}): PortalItem {
  const { chain, qty = 1, deliv = 0 } = opts
  return {
    id: 0, so: 'SO-1', proj: 'P', cust: 'C', pm: 'PM', grp: 'G', code: 'CODE', name: 'Name',
    hold: 0, qty, deliv, remain: qty - deliv,
    rate: 100, contract: 100 * qty, backlog: 100 * (qty - deliv), dvalue: 100 * deliv,
    soDate: chain[0] ?? null, cDate: '2026-12-01', cPeriod: 60,
    rework: chain[6] ? 1 : 0,
    ch: chain,
    nIA: 1, nRev: 0, nRel: 1,
    T: [null, null, null, null, null, null, null, null],
    age: 100, dtc: 10, late: 0, pct: 50,
    st: [
      [STATE.done, 'Approved', chain[2] ?? null, chain[3] ?? null, null],
      [STATE.done, 'Fully available', null, chain[4] ?? null, '2026-04-01'],
      [STATE.done, 'Completed', chain[4] ?? null, chain[5] ?? null, '2026-05-01'],
      opts.fat ?? [STATE.none, 'Not ready', null, null, null],
      gap('Awaiting Payment Entry feed'),
      opts.delivery ?? [STATE.none, 'Not ready', null, null, '2026-12-01'],
      gap('Awaiting Sales Invoice feed'),
    ],
    nextStage: 'FAT / Quality', nextStatus: 'Not ready',
  }
}

test('there are nine levels, and they start at the order', () => {
  const j = journeyOf(panel({ chain: ['2026-01-01'] }), TODAY)
  assert.equal(j.length, 9)
  assert.equal(j[0]!.label, 'Order placed')
  assert.equal(j[8]!.label, 'Delivery')
  assert.deepEqual(j.map((l) => l.label), [...JOURNEY_LABELS])
})

test('exactly one level is ever in progress', () => {
  const cases: (string | null)[][] = [
    ['2026-01-01'],
    ['2026-01-01', '2026-01-10'],
    ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05'],
    ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10'],
  ]
  for (const chain of cases) {
    const active = journeyOf(panel({ chain }), TODAY).filter((l) => l.state === 'active')
    assert.equal(active.length, 1, `chain of ${chain.length} produced ${active.length} active levels`)
  }
})

test('an order with nothing recorded is placed, then waiting on drawings', () => {
  const j = journeyOf(panel({ chain: ['2026-01-01'] }), TODAY)
  assert.equal(j[0]!.state, 'done')
  assert.equal(j[1]!.state, 'active')
  assert.equal(j[1]!.label, 'Preparing drawings')
  assert.ok(j.slice(2).every((l) => l.state === 'pending'))
})

test('a finished level reports how long it took; the live one how long it has run', () => {
  const j = journeyOf(panel({ chain: ['2026-01-01', '2026-01-11'] }), TODAY)
  assert.equal(j[1]!.state, 'done')
  assert.equal(j[1]!.days, 10, 'took ten days')

  const live = j.find((l) => l.state === 'active')!
  assert.equal(live.label, 'Waiting for approval to proceed')
  assert.equal(live.days, 212, 'open since 11 Jan against a 11 Aug as-of date')
})

test('the approval level is titled "waiting" only while it is the one waiting', () => {
  // Waiting on the customer: the card says what is needed, not where the paper is.
  const open = journeyOf(panel({ chain: ['2026-01-01', '2026-01-11'] }), TODAY)
  assert.equal(open[2]!.state, 'active')
  assert.equal(open[2]!.label, 'Waiting for approval to proceed')
  assert.equal(open[2]!.status, 'Pending Approval')

  // Already approved. The neutral ladder name has to come back, or the same card
  // reads "Waiting for approval to proceed — Complete" and contradicts itself.
  const past = journeyOf(panel({ chain: ['2026-01-01', '2026-01-11', '2026-01-20'] }), TODAY)
  assert.equal(past[2]!.state, 'done')
  assert.equal(past[2]!.label, JOURNEY_LABELS[2])
  assert.equal(past[2]!.status, 'Complete')

  // Not reached yet: nothing is being waited on, so the same applies.
  const ahead = journeyOf(panel({ chain: ['2026-01-01'] }), TODAY)
  assert.equal(ahead[2]!.state, 'pending')
  assert.equal(ahead[2]!.label, JOURNEY_LABELS[2])
})

test('no rework on a manufactured panel is a pass, not a missing step', () => {
  // The trap: treating "no rework document" as "quality check not done" would leave
  // every clean panel stuck one level short of FAT forever.
  const chain = ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10']
  const j = journeyOf(panel({ chain }), TODAY)
  const quality = j[6]!
  assert.equal(quality.label, 'Quality check')
  assert.equal(quality.state, 'done')
  assert.match(quality.status, /no adjustments needed/i)
})

test('open rework holds the quality level, and closed rework releases it', () => {
  const base = ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10']

  const open = journeyOf(panel({ chain: [...base, '2026-04-01'] }), TODAY)
  assert.equal(open[6]!.state, 'active')
  assert.match(open[6]!.status, /in progress/i)

  const closed = journeyOf(
    panel({ chain: [...base, '2026-04-01', '2026-04-20', '2026-05-01'] }),
    TODAY,
  )
  assert.equal(closed[6]!.state, 'done')
  assert.equal(closed[6]!.days, 30, 'raised 1 Apr, closed 1 May')
})

test('delivery only completes when every panel has shipped', () => {
  const chain = ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10']
  const fat: Stage = [STATE.done, 'FAT passed', '2026-03-11', '2026-03-15', null]

  const partial = journeyOf(panel({ chain, fat, qty: 2, deliv: 1 }), TODAY)
  assert.notEqual(partial[8]!.state, 'done', '1 of 2 delivered is not delivered')

  const all = journeyOf(panel({ chain, fat, qty: 2, deliv: 2 }), TODAY)
  assert.equal(all[8]!.state, 'done')
})

test('an unavailable milestone is reported as awaiting the feed, never as failed', () => {
  const chain = ['2026-01-01', '2026-01-10', '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10']
  const j = journeyOf(panel({ chain, delivery: gap('Awaiting Sales Invoice feed') }), TODAY)
  assert.match(j[8]!.status, /awaiting erp feed/i)
})

test('a level the ERP never recorded is behind us, not in progress', () => {
  // 50 of the 480 lines in the export have no initial-drawing submission. Without
  // the monotonic pass this panel showed "Preparing drawings — in progress"
  // alongside a completed Manufacturing, which is a contradiction, not a gap.
  const chain = ['2026-01-01', null, '2026-02-01', '2026-02-05', '2026-03-01', '2026-03-10']
  const j = journeyOf(panel({ chain }), TODAY)

  assert.equal(j[1]!.label, 'Preparing drawings')
  assert.equal(j[1]!.state, 'done', 'manufacturing is finished, so drawings cannot be in progress')
  assert.equal(j[1]!.status, 'Not recorded')
  assert.equal(j[1]!.days, null, 'no duration is claimed for a level with no timestamps')
  assert.equal(j[1]!.from, null, 'and no borrowed dates')

  assert.equal(journeyOf(panel({ chain }), TODAY).filter((l) => l.state === 'active').length, 1)
  // The frontier has moved to where the work actually is.
  assert.equal(j.find((l) => l.state === 'active')!.label, 'FAT')
})

test('levels never regress: once one is done, nothing before it is pending', () => {
  const chain = ['2026-01-01', null, '2026-02-01', null, '2026-03-01', '2026-03-10']
  const j = journeyOf(panel({ chain }), TODAY)
  const lastDone = j.reduce((acc, l, i) => (l.state === 'done' ? i : acc), -1)
  for (let i = 0; i < lastDone; i += 1) {
    assert.equal(j[i]!.state, 'done', `level ${i + 1} (${j[i]!.label}) precedes a finished level`)
  }
})
