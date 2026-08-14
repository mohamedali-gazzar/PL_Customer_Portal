/**
 * The 7-stage rules, checked case by case against PDF §4.
 *
 * Table-driven so each row reads as "given this evidence, the brief says this
 * status". The negative cases matter as much as the positive ones: several
 * assertions here exist to prove the portal does *not* state something the source
 * cannot support.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimeline,
  deriveStage1,
  deriveStage2,
  deriveStage3,
  deriveStage4,
  deriveStage5,
  deriveStage6,
  deriveStage7,
  isKnown,
  type Milestone,
} from '@/domain'
import { erpnextCaps, excelCaps, line, TODAY, type LineSeed } from '../support/build'

function statusOf(m: Milestone): string {
  return isKnown(m.status) ? m.status.value : `unknown:${m.status.reason}`
}

function run(
  rule: (input: { line: ReturnType<typeof line>; capabilities: typeof excelCaps; today: typeof TODAY }) => Milestone,
  seed: LineSeed,
  capabilities = excelCaps,
): Milestone {
  return rule({ line: line(seed), capabilities, today: TODAY })
}

/* ───────────────── Stage 1 — Drawings Approval ───────────────── */

describe('stage 1 — drawings approval', () => {
  const cases: [string, LineSeed, string][] = [
    ['no RFD event yet → PDF §4 default', { rfd: {} }, 'under_preparation'],
    ['initial approval submitted', { rfd: { initialSubmittedOn: '2026-06-01' } }, 'sent_for_approval'],
    ['revision submitted', { rfd: { revisionSubmittedOn: '2026-06-20' } }, 'sent_for_approval'],
    ['release RFD exists', { rfd: { initialSubmittedOn: '2026-05-01', releasedOn: '2026-06-01' } }, 'approved'],
    // 114 rows in the export have a release with no recorded initial submission.
    ['release without an initial submission', { rfd: { hasRelease: true } }, 'approved'],
  ]

  for (const [name, seed, expected] of cases) {
    test(name, () => {
      assert.equal(statusOf(run(deriveStage1, seed)), expected)
    })
  }

  test('approved is complete; sent for approval is not', () => {
    assert.equal(run(deriveStage1, { rfd: { releasedOn: '2026-06-01' } }).isComplete, true)
    assert.equal(run(deriveStage1, { rfd: { initialSubmittedOn: '2026-06-01' } }).isComplete, false)
  })

  test('planned date is unknown — the export has no RFD request_due_date', () => {
    const m = run(deriveStage1, { rfd: { initialSubmittedOn: '2026-06-01' } })
    assert.equal(m.plannedEnd.state, 'unknown')
    assert.equal(m.plannedEnd.state === 'unknown' && m.plannedEnd.reason, 'not_in_source')
  })

  test('planned date appears once the capability is on, with no rule change', () => {
    const m = run(deriveStage1, { rfd: { initialSubmittedOn: '2026-06-01', requestDueOn: '2026-06-10' } }, erpnextCaps)
    assert.equal(m.plannedEnd.state, 'known')
  })

  test('actual start is the later of initial and revision submission', () => {
    const m = run(deriveStage1, { rfd: { initialSubmittedOn: '2026-05-01', revisionSubmittedOn: '2026-06-20' } })
    assert.deepEqual(m.actualStart, { state: 'known', value: '2026-06-20' })
  })
})

/* ─────────── blocked on customer (the T2 signal) ─────────── */

describe('blocked on customer', () => {
  test('submitted and not released → awaiting, with a day count', () => {
    const t = buildTimeline(line({ rfd: { initialSubmittedOn: '2026-08-01' } }), excelCaps, TODAY)
    assert.ok(isKnown(t.blockedOnCustomer))
    assert.equal(t.blockedOnCustomer.value.reason, 'drawing_approval')
    assert.deepEqual(t.blockedOnCustomer.value.sinceDays, { state: 'known', value: 12 })
  })

  test('released → not awaiting', () => {
    const t = buildTimeline(
      line({ rfd: { initialSubmittedOn: '2026-06-01', releasedOn: '2026-06-10' } }),
      excelCaps,
      TODAY,
    )
    assert.equal(t.blockedOnCustomer.state, 'unknown')
  })

  test('out-of-order source dates do not produce a negative wait', () => {
    // Submission dated in the future relative to `today`: the export contains such
    // rows, and "-30 days waiting" would be nonsense on screen.
    const t = buildTimeline(line({ rfd: { initialSubmittedOn: '2026-09-12' } }), excelCaps, TODAY)
    assert.ok(isKnown(t.blockedOnCustomer))
    assert.equal(t.blockedOnCustomer.value.sinceDays.state, 'unknown')
  })
})

/* ───────────────── Stage 2 — Material Readiness ───────────────── */

describe('stage 2 — material readiness', () => {
  const cases: [string, LineSeed, string, boolean][] = [
    ['no work order → PDF §4 default', {}, 'material_not_available', false],
    ['material_status = Not Available', { wo: { materialStatus: 'not_available' } }, 'material_not_available', false],
    ['material_status = Partially Available', { wo: { materialStatus: 'partially_available' } }, 'partially_available', false],
    ['material_status = Available', { wo: { materialStatus: 'available' } }, 'fully_available', true],
  ]

  for (const [name, seed, expected, complete] of cases) {
    test(name, () => {
      const m = run(deriveStage2, seed)
      assert.equal(statusOf(m), expected)
      assert.equal(m.isComplete, complete)
    })
  }

  test('planned and actual dates come from the documented source fields', () => {
    const m = run(deriveStage2, {
      wo: { materialStatus: 'available', materialPlannedOn: '2026-04-15', materialReadyOn: '2026-04-20' },
    })
    assert.deepEqual(m.plannedEnd, { state: 'known', value: '2026-04-15' })
    assert.deepEqual(m.actualEnd, { state: 'known', value: '2026-04-20' })
    assert.deepEqual(m.varianceDays, { state: 'known', value: 5 })
  })

  test('Available with no transfer date: complete, but no actual date invented', () => {
    // 65 rows in the export are in exactly this state.
    const m = run(deriveStage2, { wo: { materialStatus: 'available' } })
    assert.equal(m.isComplete, true)
    assert.equal(m.actualEnd.state, 'unknown')
    assert.equal(m.varianceDays.state, 'unknown')
  })
})

/* ───────────────── Stage 3 — Manufacturing ───────────────── */

describe('stage 3 — manufacturing', () => {
  const cases: [string, LineSeed, string][] = [
    ['no work order → PDF §4 default', {}, 'not_started'],
    ['status = Not Started', { wo: { status: 'not_started' } }, 'not_started'],
    ['status = In Process', { wo: { status: 'in_process' } }, 'in_progress'],
    ['status = Completed', { wo: { status: 'completed', manufacturingCompletedOn: '2026-07-24' } }, 'completed'],
  ]

  for (const [name, seed, expected] of cases) {
    test(name, () => {
      assert.equal(statusOf(run(deriveStage3, seed)), expected)
    })
  }

  test('several work orders with differing statuses roll up conservatively', () => {
    // "Completed, Not Started" must not read as completed.
    const m = run(deriveStage3, { wo: { status: 'mixed', manufacturingCompletedOn: '2026-07-24' } })
    assert.equal(statusOf(m), 'in_progress')
    assert.equal(m.isComplete, false)
  })

  test('status "Closed" with a completion date counts as complete', () => {
    const m = run(deriveStage3, { wo: { status: 'closed', manufacturingCompletedOn: '2026-07-24' } })
    assert.equal(statusOf(m), 'completed')
    assert.equal(m.isComplete, true)
  })

  test('status "Closed" without a completion date is reported unknown, not guessed', () => {
    // `Closed` is absent from the §4 rule table, so nothing is asserted about it.
    const m = run(deriveStage3, { wo: { status: 'closed' } })
    assert.equal(m.status.state, 'unknown')
    assert.equal(m.derivation, 'unavailable')
  })

  test('planned start stays unknown — the export has no planned_start_date', () => {
    const m = run(deriveStage3, { wo: { status: 'in_process' } })
    assert.equal(m.plannedStart.state, 'unknown')
  })

  test('actual start falls back to material-ready, and says so', () => {
    const m = run(deriveStage3, { wo: { status: 'completed', materialReadyOn: '2026-04-20', manufacturingCompletedOn: '2026-07-24' } })
    assert.deepEqual(m.actualStart, { state: 'known', value: '2026-04-20' })
    assert.match(m.provenance.actualStart ?? '', /material_transfer|T5/)
  })

  test('work order creation date is never used as the actual start', () => {
    const m = run(deriveStage3, { wo: { status: 'in_process', createdOn: '2026-01-05' } })
    assert.notDeepEqual(m.actualStart, { state: 'known', value: '2026-01-05' })
  })

  test('real actual_start_date is preferred once available', () => {
    const m = run(
      deriveStage3,
      { wo: { status: 'in_process', actualStartOn: '2026-05-02', materialReadyOn: '2026-04-20' } },
      erpnextCaps,
    )
    assert.deepEqual(m.actualStart, { state: 'known', value: '2026-05-02' })
    assert.equal(m.provenance.actualStart, 'work_order.actual_start_date')
  })

  test('variance is late-positive', () => {
    const m = run(deriveStage3, {
      wo: { status: 'completed', plannedEndOn: '2026-06-10', manufacturingCompletedOn: '2026-07-24' },
    })
    assert.deepEqual(m.varianceDays, { state: 'known', value: 44 })
  })
})

/* ───────────────── Stage 4 — FAT ───────────────── */

describe('stage 4 — FAT', () => {
  test('manufacturing not complete → PDF §4 default', () => {
    assert.equal(statusOf(run(deriveStage4, { wo: { status: 'in_process' } })), 'not_ready')
  })

  test('manufacturing complete → invitation, but marked partial', () => {
    const m = run(deriveStage4, { wo: { status: 'completed', manufacturingCompletedOn: '2026-07-24' } })
    assert.equal(statusOf(m), 'fat_invitation')
    // The key assertion: without Stock Entry data the outcome is unobservable, so
    // the stage can never complete and is excluded from progress arithmetic.
    assert.equal(m.derivation, 'partial')
    assert.equal(m.isComplete, false)
    assert.equal(m.actualEnd.state, 'unknown')
  })

  test('rework in progress → neutral status, no reason exposed', () => {
    const m = run(deriveStage4, {
      wo: { status: 'completed', manufacturingCompletedOn: '2026-05-20' },
      rework: { inProgress: true },
    })
    assert.equal(statusOf(m), 'rework_in_progress')
    // The whole milestone is inspected: no rework reason or comment field exists.
    assert.equal(JSON.stringify(m).includes('reason'), true) // Maybe carries `reason`
    assert.equal(/rework_reason|rework_comment/.test(JSON.stringify(m)), false)
  })

  test('FAT success is reachable once Stock Entry data exists', () => {
    const m = run(
      deriveStage4,
      { wo: { status: 'completed', manufacturingCompletedOn: '2026-07-24' } },
      erpnextCaps,
    )
    assert.equal(m.derivation, 'evidence')
  })

  test('a component line has no FAT stage', () => {
    const m = run(deriveStage4, { itemClass: 'supplied_component' })
    assert.equal(m.status.state, 'unknown')
    assert.equal(m.status.state === 'unknown' && m.status.reason, 'not_applicable')
  })
})

/* ──────── Stages 5 & 7 — the finance-dependent stages ──────── */

describe('stages 5 and 7 — finance', () => {
  test('stage 5 is unavailable, not "payment due"', () => {
    // Deriving "Delivery Payment Due" from work order status alone would be
    // possible, but with no Payment Entry data it could never become "Paid" — so a
    // customer who has already paid would see a permanent payment demand.
    const m = run(deriveStage5, { wo: { status: 'completed', manufacturingCompletedOn: '2026-07-24' } })
    assert.equal(m.status.state, 'unknown')
    assert.equal(m.derivation, 'unavailable')
    assert.notEqual(statusOf(m), 'delivery_payment_due')
  })

  test('stage 7 is unavailable, not "not paid"', () => {
    const m = run(deriveStage7, { wo: { status: 'completed' } })
    assert.equal(m.status.state, 'unknown')
    assert.equal(m.derivation, 'unavailable')
    assert.notEqual(statusOf(m), 'not_paid')
  })

  test('both become derivable when the finance capability is on', () => {
    assert.notEqual(run(deriveStage5, { wo: { status: 'completed' } }, erpnextCaps).derivation, 'unavailable')
    assert.notEqual(run(deriveStage7, {}, erpnextCaps).derivation, 'unavailable')
  })
})

/* ───────────────── Stage 6 — Delivery ───────────────── */

describe('stage 6 — delivery readiness', () => {
  test('unavailable, and a delivered quantity of 0 is not read as "not delivered"', () => {
    const m = run(deriveStage6, { orderedQty: 4, deliveredQty: 0 })
    assert.equal(m.status.state, 'unknown')
    assert.equal(m.derivation, 'unavailable')
    assert.notEqual(statusOf(m), 'not_ready')
  })

  test('delivered is derivable once delivery evidence exists', () => {
    const m = run(deriveStage6, { orderedQty: 4, deliveredQty: 4 }, erpnextCaps)
    assert.equal(statusOf(m), 'delivered')
    assert.equal(m.isComplete, true)
  })
})

describe('stage 1 — drawing revised after release (regression)', () => {
  test('the approved period starts at the first submission, never the last', () => {
    /*
     * Real data: initial drawings submitted 4 Jan, released 12 Jan, then a revision
     * submitted 30 Jul. Taking the latest submission produced a stage starting after
     * it ended, which the timeline rendered as a six-month approval bar.
     */
    const m = run(deriveStage1, {
      rfd: { initialSubmittedOn: '2026-01-04', releasedOn: '2026-01-12', revisionSubmittedOn: '2026-07-30' },
    })
    assert.deepEqual(m.actualStart, { state: 'known', value: '2026-01-04' })
    assert.deepEqual(m.actualEnd, { state: 'known', value: '2026-01-12' })
  })

  test('actual start never follows actual end for an approved stage', () => {
    const cases: LineSeed[] = [
      { rfd: { initialSubmittedOn: '2026-01-04', releasedOn: '2026-01-12', revisionSubmittedOn: '2026-07-30' } },
      { rfd: { revisionSubmittedOn: '2026-02-01', releasedOn: '2026-03-01' } },
      { rfd: { initialSubmittedOn: '2026-01-04', releasedOn: '2026-01-12' } },
    ]
    for (const seed of cases) {
      const m = run(deriveStage1, seed)
      if (isKnown(m.actualStart) && isKnown(m.actualEnd)) {
        assert.ok(m.actualStart.value <= m.actualEnd.value, `${m.actualStart.value} > ${m.actualEnd.value}`)
      }
    }
  })

  test('while awaiting approval the latest submission is still used', () => {
    // There the most recent thing sent is what the customer is holding.
    const m = run(deriveStage1, {
      rfd: { initialSubmittedOn: '2026-01-04', revisionSubmittedOn: '2026-07-30' },
    })
    assert.equal(statusOf(m), 'sent_for_approval')
    assert.deepEqual(m.actualStart, { state: 'known', value: '2026-07-30' })
  })
})
