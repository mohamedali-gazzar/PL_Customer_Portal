/**
 * Reading the two reports.
 *
 * The portal now loads both PM Phase Cycle Times exports. They are mutually
 * exclusive by construction — one holds `delivered_qty < qty`, the other
 * `delivered_qty >= qty` — and they do not carry the same columns, which is the
 * part that bites. Delivered ships 59 columns against Open Backlog's 109, and none
 * of the `Current *` family. See docs/SPEC-AUDIT.md §3.1.
 *
 * What these tests protect is that the absence is handled by *saying so*, never by
 * substituting a plausible value.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveItem } from '@/portal/derive'
import { journeyOf } from '@/portal/journey'
import { COLUMN_KEYS, DELIVERED_KEYS, OPEN_KEYS, isDnApproved } from '@/providers/excel/columns'
import type { RawBacklogRow } from '@/providers/excel/parse'

type Fields = Partial<Record<(typeof COLUMN_KEYS)[number], string | number | null>>

function row(fields: Fields): RawBacklogRow {
  const r: Record<string, unknown> = { __rowNumber: 2 }
  for (const k of COLUMN_KEYS) r[k] = null
  Object.assign(r, fields)
  return r as unknown as RawBacklogRow
}

/** A row as the Delivered export supplies it: no backlog, no current_* columns. */
const deliveredRow: Fields = {
  salesOrder: 'SO-25-00251',
  project: 'Hospital',
  customer: 'Acme',
  item: 'EMDB -251/25',
  soQty: 2,
  deliveredQty: 2,
  deliveredAmount: 500,
  soSubmitted: '2025-11-12',
  contractualDate: '2025-12-22',
  deliveredDate: '2026-08-20',
}

test('the delivered export prices its lines, having no backlog column at all', () => {
  // Open Backlog recovers the unit rate from backlog ÷ remaining. A delivered line
  // has no backlog and no remainder, so that divides to zero — and every shipped
  // panel would drop out of contract value, which is the error Delta 4 exists to
  // fix. It prices from Delivered Amount instead.
  const it = deriveItem(0, row(deliveredRow))
  assert.equal(it.rate, 250)
  assert.equal(it.contract, 500)
  assert.equal(it.dvalue, 500)
  assert.equal(it.backlog, 0, 'a shipped line owes nothing')
})

test('a delivered row is v8 Delivery without a Current Stage column to say so', () => {
  // Not a guess: the report's own filter is delivered_qty >= qty, and that one
  // resulting stage is v8's Delivery — stage 10, where the old model said 11.
  const it = deriveItem(0, row(deliveredRow))
  assert.equal(it.stage, 10)
  assert.equal(it.step, 'Delivered')
  assert.equal(it.pct, 100)
})

test('a passed stage with no date is Completed, and simply shows no date', () => {
  /* Drawings Approval completes on `rel_approved`, a column this export omits.
     The stage is behind the reported frontier, so it is Completed; the missing
     column costs it its date and nothing else. A gap in the record is not
     evidence that the panel never passed the stage. */
  const it = deriveItem(0, row(deliveredRow))
  const j = journeyOf(it, '2026-08-22')

  const approval = j.find((s) => s.n === 2)!
  assert.equal(approval.state, 'done')
  assert.equal(approval.to, null, 'no invented date')
  assert.ok(approval.steps.every((x) => x.on === null))

  const delivery = j[j.length - 1]!
  assert.equal(delivery.n, 10)
  assert.equal(delivery.to, '2026-08-20')
})

test('the two exports cannot describe the same line', () => {
  const open = deriveItem(0, row({ ...deliveredRow, deliveredQty: 1, remainingQty: 1, backlogAmount: 250 }))
  const shipped = deriveItem(1, row(deliveredRow))
  assert.ok(open.deliv < open.qty, 'open backlog holds what is still owed')
  assert.ok(shipped.deliv >= shipped.qty, 'delivered holds what is not')
})

test('a part-shipped line is priced on what is still owed, and labelled honestly', () => {
  const it = deriveItem(0, row({ ...deliveredRow, deliveredQty: 1, remainingQty: 1, backlogAmount: 250 }))
  assert.equal(it.rate, 250)
  const j = journeyOf({ ...it, stage: 11 }, '2026-08-22')
  assert.equal(j[j.length - 1]!.status, 'Partially delivered')
})

/* ------------------------------------------------------------ dispatch -- */

test('only a genuinely approved delivery note counts as approved', () => {
  for (const s of [
    'Approved',
    'Approved by Accounts',
    'Approved by Accounts Manager',
    'Approved By Accounts User',
    'Approved by Deliveries',
  ]) {
    assert.ok(isDnApproved(s), `${s} should count`)
  }
  // Draft is the one that matters: 119 open items sit on this milestone, and
  // treating a draft as approved would tell every one of them they are cleared.
  assert.ok(!isDnApproved('Draft'))
  assert.ok(!isDnApproved('Pending'))
  assert.ok(!isDnApproved(null))
  assert.ok(!isDnApproved(''))
})

test('approval matching survives the casing the export actually uses', () => {
  // "Approved By Accounts User" capitalises By; the others do not.
  assert.ok(isDnApproved('approved by accounts'))
  assert.ok(isDnApproved('APPROVED BY DELIVERIES'))
})

/* -------------------------------------------------------- report shape -- */

test('the delivered shape is a strict subset, plus the two columns only it has', () => {
  const openOnly = OPEN_KEYS.filter((k) => !DELIVERED_KEYS.includes(k))
  const deliveredOnly = DELIVERED_KEYS.filter((k) => !OPEN_KEYS.includes(k))
  assert.deepEqual(deliveredOnly, ['deliveredAmount', 'deliveredDate'])
  // The columns Delta 2 needs and Delivered does not supply. Named here so that a
  // corrected export shows up as a failing test rather than going unnoticed.
  for (const k of ['relApproved', 'mainWoSubmittedOn', 'mainFatSuccess', 'currentStageNo']) {
    assert.ok(openOnly.includes(k as (typeof OPEN_KEYS)[number]), `${k} is open-only today`)
  }
})
