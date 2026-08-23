/**
 * The four figures on the dashboard.
 *
 * Two of them are new, and both are statements a customer will act on. The tests
 * below are mostly about the boundaries where a figure could quietly become a
 * different claim than intended: a year filter that the number ignores, a stage
 * counted from translated text, a delivered total that leaves out the lines whose
 * money the export prices differently.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { awaitingYourApproval, deliveredToDate } from '@/portal/kpis'
import { AWAITING_APPROVAL_STAGE } from '@/portal/milestones'
import type { CustomerItem, PortalOrder } from '@/portal/types'

const order = (so: string, dvalue: number): PortalOrder =>
  ({ so, dvalue, contract: 0, backlog: 0 }) as PortalOrder

const item = (so: string, stage: number): CustomerItem => ({ so, stage }) as CustomerItem

test('delivered to date adds up what the orders already say', () => {
  // Read, never recomputed. `dvalue` is derived once in derive.ts, including the
  // rate recovery for lines with nothing remaining, and a second calculation here
  // is how two screens end up disagreeing about the same money.
  const total = deliveredToDate([order('A', 1_200_000), order('B', 300_000.5)])
  assert.equal(total, 1_500_000.5)
})

test('delivered to date is zero, not blank, when nothing has shipped', () => {
  assert.equal(deliveredToDate([]), 0)
  assert.equal(deliveredToDate([order('A', 0)]), 0)
})

test('delivered to date follows the year filter', () => {
  // The caller passes the orders already in view. A customer filtering to one year
  // is asking what that year delivered.
  const all = [order('A', 100), order('B', 250)]
  assert.equal(deliveredToDate(all), 350)
  assert.equal(deliveredToDate(all.slice(0, 1)), 100)
})

test('waiting for your approval counts the drawings stage and nothing else', () => {
  const orders = [order('A', 0)]
  const items = [
    item('A', AWAITING_APPROVAL_STAGE),
    item('A', AWAITING_APPROVAL_STAGE),
    item('A', 6),  // in production
    item('A', 0),  // order creation
    item('A', 11), // delivered
  ]
  assert.equal(awaitingYourApproval(orders, items), 2)
})

test('the count is scoped to the orders on screen', () => {
  // Otherwise the figure contradicts the rows directly beneath it: a customer
  // filtered to 2026 would be told three items need them and shown one.
  const items = [item('A', AWAITING_APPROVAL_STAGE), item('B', AWAITING_APPROVAL_STAGE)]
  assert.equal(awaitingYourApproval([order('A', 0)], items), 1)
  assert.equal(awaitingYourApproval([order('A', 0), order('B', 0)], items), 2)
})

test('nothing waiting is zero rather than a stale count', () => {
  assert.equal(awaitingYourApproval([order('A', 0)], [item('A', 6)]), 0)
  assert.equal(awaitingYourApproval([], []), 0)
})

test('the count comes from the stage number, not from any displayed text', () => {
  // The guard against counting badge labels: those are translated, so an Arabic
  // dashboard would report a different number from the English one for the same
  // account. The stage is an integer owned by the report and is language-neutral.
  const items = [item('A', AWAITING_APPROVAL_STAGE)]
  assert.equal(typeof items[0]!.stage, 'number')
  assert.equal(awaitingYourApproval([order('A', 0)], items), 1)
  assert.equal(AWAITING_APPROVAL_STAGE, 2)
})
