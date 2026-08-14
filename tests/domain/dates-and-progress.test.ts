import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  buildTimeline,
  compareDates,
  deriveSchedule,
  diffDays,
  fromUtcDate,
  isKnown,
  plainDate,
  rollUpProject,
  rollUpProgress,
} from '@/domain'
import { erpnextCaps, excelCaps, line, project, TODAY } from '../support/build'

describe('PlainDate', () => {
  test('rejects anything that is not YYYY-MM-DD', () => {
    for (const bad of ['2026-13-01', '2026-02-30', '26-01-01', '2026/01/01', '']) {
      assert.throws(() => plainDate(bad), TypeError, `should reject ${bad}`)
    }
  })

  test('reads a Date via its UTC fields', () => {
    // Excel serial dates arrive as UTC midnight. Reading local fields would shift
    // the day for any server west of UTC and corrupt every milestone variance.
    assert.equal(fromUtcDate(new Date('2026-08-13T00:00:00Z')), '2026-08-13')
    assert.equal(fromUtcDate(new Date(Date.UTC(2026, 0, 1))), '2026-01-01')
  })

  test('day arithmetic crosses month, year and leap boundaries', () => {
    assert.equal(diffDays(plainDate('2026-08-01'), plainDate('2026-08-13')), 12)
    assert.equal(diffDays(plainDate('2026-08-13'), plainDate('2026-08-01')), -12)
    assert.equal(diffDays(plainDate('2025-12-31'), plainDate('2026-01-01')), 1)
    assert.equal(diffDays(plainDate('2024-02-28'), plainDate('2024-03-01')), 2) // leap year
    assert.equal(addDays(plainDate('2026-12-31'), 1), '2027-01-01')
    assert.equal(compareDates(plainDate('2026-01-01'), plainDate('2026-01-02')), -1)
  })
})

describe('schedule', () => {
  test('past the contractual date', () => {
    const s = deriveSchedule(project({ contractualDate: '2026-07-01' }), TODAY)
    assert.ok(isKnown(s))
    assert.equal(s.value.state, 'past_contractual_date')
    assert.equal(s.value.daysToContractual, -43)
  })

  test('due soon vs on track', () => {
    const soon = deriveSchedule(project({ contractualDate: '2026-08-30' }), TODAY)
    const later = deriveSchedule(project({ contractualDate: '2026-12-01' }), TODAY)
    assert.equal(isKnown(soon) && soon.value.state, 'due_soon')
    assert.equal(isKnown(later) && later.value.state, 'on_track')
  })

  test('no contractual date → unknown, never assumed on track', () => {
    // 169 of 480 rows in the export have no contractual date.
    const s = deriveSchedule(project({}), TODAY)
    assert.equal(s.state, 'unknown')
  })
})

describe('progress', () => {
  test('covers only stages 1–3 with the current source', () => {
    const t = buildTimeline(
      line({
        rfd: { initialSubmittedOn: '2026-02-10', releasedOn: '2026-03-03' },
        wo: { status: 'completed', materialStatus: 'available', materialReadyOn: '2026-04-20', manufacturingCompletedOn: '2026-07-24' },
      }),
      excelCaps,
      TODAY,
    )
    assert.deepEqual([...t.progressBasis], [1, 2, 3])
    assert.deepEqual(t.progressPercent, { state: 'known', value: 100 })
  })

  test('100% of stages 1–3 does not mark FAT, payment, delivery or clearance complete', () => {
    // The reason `progressBasis` exists: a bare "100% complete" would be a lie.
    const t = buildTimeline(
      line({
        rfd: { releasedOn: '2026-03-03' },
        wo: { status: 'completed', materialStatus: 'available', manufacturingCompletedOn: '2026-07-24' },
      }),
      excelCaps,
      TODAY,
    )
    for (const stage of [4, 5, 6, 7] as const) {
      assert.equal(t.milestones[stage].isComplete, false, `stage ${stage} must not be complete`)
    }
  })

  test('a half-done stage counts as half', () => {
    const t = buildTimeline(
      line({ rfd: { releasedOn: '2026-03-03' }, wo: { status: 'in_process', materialStatus: 'partially_available' } }),
      excelCaps,
      TODAY,
    )
    // stage 1 = 1, stage 2 = 0.5, stage 3 = 0.5 → 2/3
    assert.deepEqual([...t.progressBasis], [1, 2, 3])
    assert.deepEqual(t.progressPercent, { state: 'known', value: 67 })
  })

  test('the progress basis does not shift as an item advances', () => {
    // Stage 4 is unobservable with this source in *both* directions. If its
    // derivation varied by branch, the denominator would change mid-journey and a
    // percentage could fall while work moved forward.
    const early = buildTimeline(line({ wo: { status: 'not_started' } }), excelCaps, TODAY)
    const late = buildTimeline(
      line({ rfd: { releasedOn: '2026-03-03' }, wo: { status: 'completed', materialStatus: 'available', manufacturingCompletedOn: '2026-07-24' } }),
      excelCaps,
      TODAY,
    )
    assert.deepEqual([...early.progressBasis], [...late.progressBasis])
  })

  test('basis widens to all seven stages under the ERPNext capability set', () => {
    const t = buildTimeline(line({ wo: { status: 'not_started' } }), erpnextCaps, TODAY)
    assert.deepEqual([...t.progressBasis], [1, 2, 3, 4, 5, 6, 7])
  })

  test('a component line has no derivable stage and no percentage', () => {
    const t = buildTimeline(line({ itemClass: 'supplied_component' }), excelCaps, TODAY)
    assert.deepEqual([...t.progressBasis], [])
    assert.equal(t.progressPercent.state, 'unknown')
  })

  test('project rollup is quantity-weighted and excludes non-derivable lines', () => {
    const done = line({
      id: 'l_done',
      orderedQty: 9,
      rfd: { releasedOn: '2026-03-03' },
      wo: { status: 'completed', materialStatus: 'available', manufacturingCompletedOn: '2026-07-24' },
    })
    const notStarted = line({ id: 'l_new', orderedQty: 1, rfd: {} })
    const component = line({ id: 'l_comp', itemClass: 'supplied_component', orderedQty: 100 })

    const rolled = rollUpProgress(
      [done, notStarted, component].map((l) => ({ line: l, timeline: buildTimeline(l, excelCaps, TODAY) })),
    )

    // 9×100 + 1×0 over weight 10 = 90. The 100-qty component line is excluded
    // rather than dragging the project to near zero.
    assert.deepEqual(rolled.percent, { state: 'known', value: 90 })
    assert.equal(rolled.linesCounted, 2)
    assert.equal(rolled.linesTotal, 3)
  })

  test('delivered item count is unavailable, not zero, on an open-backlog source', () => {
    const rollup = rollUpProject(project({ lines: [line()] }), excelCaps, TODAY)
    assert.equal(rollup.itemCounts.delivered.state, 'unknown')
  })

  test('next milestone is the first incomplete derivable stage', () => {
    const t = buildTimeline(
      line({ rfd: { releasedOn: '2026-03-03' }, wo: { status: 'not_started', materialStatus: 'partially_available', materialPlannedOn: '2026-09-01' } }),
      excelCaps,
      TODAY,
    )
    assert.ok(isKnown(t.nextMilestone))
    assert.equal(t.nextMilestone.value.stage, 2)
    assert.deepEqual(t.nextMilestone.value.plannedOn, { state: 'known', value: '2026-09-01' })
  })
})
