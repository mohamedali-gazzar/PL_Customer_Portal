/**
 * The Stage column on the projects list.
 *
 * Every case here is a cell a customer reads. The delivered one exists because it
 * shipped blank: `stageOf` answered null for an order with nothing left running,
 * and History — where every row is finished — showed an empty column on all of
 * them. Blank does not read as "done", it reads as missing data.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { stageOf } from '@/ui/lib/order-stage'
import type { CustomerItem } from '@/portal/types'

const line = (o: { pct: number; stage: number; step?: string | null }): CustomerItem =>
  ({
    id: 1,
    so: 'SO-26-00001',
    code: 'PANEL',
    pct: o.pct,
    stage: o.stage,
    step: o.step ?? null,
    st: [],
    sd: [],
  }) as unknown as CustomerItem

test('an order with every line finished says it has been delivered', () => {
  const at = stageOf([line({ pct: 100, stage: 10 }), line({ pct: 100, stage: 10 })])
  assert.ok(at, 'a finished order still has a stage to name')
  assert.equal(at.stage, 'Delivered')
  assert.equal(at.stageKey, 'now.delivered', 'the key the journey gives a delivered line')
  assert.equal(at.status, null, 'and no step, because there is none left to be in')
  assert.equal(at.statusKey, null)
})

test('no lines is absence of information, not delivery', () => {
  // Otherwise an order whose items failed to resolve would claim to have shipped.
  assert.equal(stageOf([]), null)
})

test('an unfinished order is reported at its slowest line, not its furthest', () => {
  /* An order is only as ready as its least-advanced panel. Reporting the leader
     would tell a customer their order is at Quality while a panel of theirs has
     not left drawing. */
  const at = stageOf([
    line({ pct: 90, stage: 7, step: 'Testing' }),
    line({ pct: 10, stage: 1, step: 'Drawing preparation' }),
  ])
  assert.ok(at)
  assert.equal(at.stage, 'Drawing Creation')
  assert.equal(at.status, 'Drawing preparation')
})

test('a line with no step still names its stage', () => {
  const at = stageOf([line({ pct: 5, stage: 2, step: null })])
  assert.ok(at)
  assert.equal(at.stage, 'Drawings Approval')
  assert.equal(at.statusKey, 'table.notStarted', 'rather than inventing a step')
})

test('a fully delivered order never falls through to a stage name', () => {
  // Whatever `Current Stage #` says on a shipped line, the cell reads Delivered.
  for (const stage of [0, 4, 6, 9, 10, 11]) {
    const at = stageOf([line({ pct: 100, stage })])
    assert.equal(at?.stageKey, 'now.delivered', `stage ${stage}`)
  }
})
