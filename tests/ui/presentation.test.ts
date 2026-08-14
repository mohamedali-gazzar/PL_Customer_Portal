/**
 * UI decision logic.
 *
 * The rules that decide what a customer sees — which of the four stage states a
 * milestone lands in, what the timeline draws, what the progress label says — live in
 * plain modules precisely so they can be pinned down here rather than only being
 * eyeballed in a browser.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { MilestoneDto, StageIdDto } from '@/dto/common'
import type { ProjectItemDto } from '@/dto/project-detail'
import { formatStageRange, segmentState, statusText } from '@/ui/components/stage-state'
import {
  allDatesOf,
  hasPlottableDates,
  makeScale,
  monthTicks,
  plotItem,
  STAGE_TINT,
} from '@/ui/components/timeline-scale'
import { translator } from '@/ui/i18n/messages'

const t = translator('en')

function milestone(overrides: Partial<MilestoneDto> & { stage: StageIdDto }): MilestoneDto {
  return {
    key: 'manufacturing',
    status: { known: true, value: 'not_started' },
    plannedStart: { known: false, reason: 'not_in_source' },
    plannedEnd: { known: false, reason: 'not_in_source' },
    actualStart: { known: false, reason: 'not_in_source' },
    actualEnd: { known: false, reason: 'not_in_source' },
    varianceDays: { known: false, reason: 'not_in_source' },
    isComplete: false,
    outcomeObservable: true,
    actualStartBasis: 'none',
    ...overrides,
  }
}

function item(milestones: MilestoneDto[]): ProjectItemDto {
  return {
    id: 'l_1',
    itemCode: { known: true, value: 'X' },
    itemName: 'Test item',
    itemClass: 'manufactured',
    hasProductionJourney: true,
    quantity: { ordered: 1, remaining: { known: true, value: 1 }, produced: { known: false, reason: 'pending' } },
    cubicles: { known: false, reason: 'not_in_source' },
    currentStage: { known: true, value: 3 },
    progress: { percent: { known: true, value: 50 }, basis: [1, 2, 3], linesCounted: 1, linesTotal: 1 },
    nextMilestone: { known: false, reason: 'pending' },
    blockedOnCustomer: { known: false, reason: 'pending' },
    milestones,
  }
}

describe('stage states', () => {
  test('an unknown status is void, never pending', () => {
    // The load-bearing distinction: "we cannot say" must not look like "not yet".
    const m = milestone({ stage: 5, status: { known: false, reason: 'not_in_source' } })
    assert.equal(segmentState(m, null), 'void')
  })

  test('a known-but-not-started status is pending, never void', () => {
    const m = milestone({ stage: 3, status: { known: true, value: 'not_started' } })
    assert.equal(segmentState(m, null), 'pending')
  })

  test('void and pending are different states for the same stage number', () => {
    const unknown = milestone({ stage: 6, status: { known: false, reason: 'not_in_source' } })
    const notYet = milestone({ stage: 6, status: { known: true, value: 'not_ready' } })
    assert.notEqual(segmentState(unknown, null), segmentState(notYet, null))
  })

  test('a line with no production journey is notApplicable, not void', () => {
    const m = milestone({ stage: 4, status: { known: false, reason: 'not_applicable' } })
    assert.equal(segmentState(m, null), 'notApplicable')
  })

  test('complete beats active', () => {
    const m = milestone({ stage: 3, isComplete: true, status: { known: true, value: 'completed' } })
    assert.equal(segmentState(m, 3), 'complete')
  })

  test('the current stage is active', () => {
    const m = milestone({ stage: 3, status: { known: true, value: 'in_progress' } })
    assert.equal(segmentState(m, 3), 'active')
    assert.equal(segmentState(m, 2), 'pending')
  })

  test('status text is never blank, including for unknown statuses', () => {
    const statuses: MilestoneDto[] = [
      milestone({ stage: 1, status: { known: true, value: 'approved' } }),
      milestone({ stage: 5, status: { known: false, reason: 'not_in_source' } }),
      milestone({ stage: 4, status: { known: false, reason: 'not_applicable' } }),
    ]
    for (const m of statuses) {
      assert.notEqual(statusText(m, t).trim(), '')
    }
  })
})

describe('progress basis label', () => {
  test('contiguous ranges collapse, gaps do not', () => {
    assert.equal(formatStageRange([1, 2, 3]), '1–3')
    assert.equal(formatStageRange([1, 2, 3, 4, 5, 6, 7]), '1–7')
    assert.equal(formatStageRange([1, 3]), '1, 3')
    assert.equal(formatStageRange([2]), '2')
  })

  test('an empty basis renders a dash, never an empty string', () => {
    assert.equal(formatStageRange([]), '—')
  })
})

describe('timeline scale', () => {
  test('no dates means no scale, so nothing is plotted', () => {
    assert.equal(makeScale([], '2026-08-13'), null)
  })

  test('today is always inside the domain', () => {
    // Even when every date is in the past, the Today line must be drawable.
    const scale = makeScale(['2024-01-15', '2024-03-20'], '2026-08-13')
    assert.ok(scale)
    const pct = scale.pct('2026-08-13')
    assert.ok(pct > 0 && pct < 100, `today at ${pct}% should be inside the plot`)
  })

  test('percentages are ordered and clamped', () => {
    const scale = makeScale(['2026-01-01', '2026-12-31'], '2026-06-15')
    assert.ok(scale)
    assert.ok(scale.pct('2026-01-01') < scale.pct('2026-06-15'))
    assert.ok(scale.pct('2026-06-15') < scale.pct('2026-12-31'))
    assert.equal(scale.pct('2020-01-01'), 0)
    assert.equal(scale.pct('2099-01-01'), 100)
  })

  test('a single-day domain is widened so markers do not overlap', () => {
    const scale = makeScale(['2026-08-13'], '2026-08-13')
    assert.ok(scale)
    assert.ok(scale.max - scale.min >= 30 * 86_400_000)
  })

  test('month ticks span the domain and stay bounded', () => {
    const scale = makeScale(['2026-01-10', '2026-05-10'], '2026-03-01')
    assert.ok(scale)
    const ticks = monthTicks(scale)
    assert.ok(ticks.length >= 5 && ticks.length <= 8, `got ${ticks.length} ticks`)
    for (const tick of ticks) assert.match(tick, /^\d{4}-\d{2}-01$/)
  })
})

describe('timeline geometry', () => {
  test('a planned finish with no planned start becomes a marker, not a bar', () => {
    // This is the honest correction to the mockup: no planned start exists in the
    // source, so a bar would have to invent one.
    const m = milestone({ stage: 2, plannedEnd: { known: true, value: '2026-04-15' } })
    const scale = makeScale(['2026-04-15'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(item([m]), scale)
    assert.equal(plot.plannedMarkers.length, 1)
    assert.equal(plot.plannedSpans.length, 0)
  })

  test('a planned start and finish together become a bar (the ERPNext case)', () => {
    const m = milestone({
      stage: 3,
      plannedStart: { known: true, value: '2026-04-01' },
      plannedEnd: { known: true, value: '2026-06-10' },
    })
    const scale = makeScale(['2026-04-01', '2026-06-10'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(item([m]), scale)
    assert.equal(plot.plannedSpans.length, 1)
    assert.equal(plot.plannedMarkers.length, 0)
  })

  test('a known actual period becomes a bar', () => {
    const m = milestone({
      stage: 3,
      actualStart: { known: true, value: '2026-04-20' },
      actualEnd: { known: true, value: '2026-07-24' },
    })
    const scale = makeScale(['2026-04-20', '2026-07-24'], '2026-08-01')
    assert.ok(scale)
    const plot = plotItem(item([m]), scale)
    assert.equal(plot.actualSpans.length, 1)
    assert.ok(plot.actualSpans[0]!.widthPct > 0)
  })

  test('an actual end with no start becomes a marker', () => {
    const m = milestone({ stage: 2, actualEnd: { known: true, value: '2026-04-20' } })
    const scale = makeScale(['2026-04-20'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(item([m]), scale)
    assert.equal(plot.actualMarkers.length, 1)
    assert.equal(plot.actualSpans.length, 0)
  })

  test('delay is drawn only when both ends are real dates', () => {
    const late = milestone({
      stage: 3,
      plannedEnd: { known: true, value: '2026-06-10' },
      actualEnd: { known: true, value: '2026-07-24' },
      varianceDays: { known: true, value: 44 },
    })
    const scale = makeScale(['2026-06-10', '2026-07-24'], '2026-08-01')
    assert.ok(scale)
    const plot = plotItem(item([late]), scale)
    assert.equal(plot.delays.length, 1)
    assert.equal(plot.delays[0]!.days, 44)
  })

  test('an unfinished stage past its planned date is not drawn as delay', () => {
    // The source cannot say when it will finish, so no overrun length is inferable.
    const running = milestone({
      stage: 3,
      plannedEnd: { known: true, value: '2026-06-10' },
      status: { known: true, value: 'in_progress' },
    })
    const scale = makeScale(['2026-06-10'], '2026-08-13')
    assert.ok(scale)
    assert.equal(plotItem(item([running]), scale).delays.length, 0)
  })

  test('early completion produces no delay bar', () => {
    const early = milestone({
      stage: 3,
      plannedEnd: { known: true, value: '2026-07-24' },
      actualEnd: { known: true, value: '2026-06-10' },
      varianceDays: { known: true, value: -44 },
    })
    const scale = makeScale(['2026-06-10', '2026-07-24'], '2026-08-01')
    assert.ok(scale)
    assert.equal(plotItem(item([early]), scale).delays.length, 0)
  })

  test('an item with no dates is flagged empty rather than drawn blank', () => {
    const scale = makeScale(['2026-01-01'], '2026-02-01')
    assert.ok(scale)
    assert.equal(plotItem(item([milestone({ stage: 1 })]), scale).isEmpty, true)
  })

  test('a stage with no dates contributes no geometry at all', () => {
    // Stages 5–7 are unavailable here; they must not appear as zero-width artefacts.
    const scale = makeScale(['2026-04-20'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(
      item([
        milestone({ stage: 2, actualEnd: { known: true, value: '2026-04-20' } }),
        milestone({ stage: 5, status: { known: false, reason: 'not_in_source' } }),
        milestone({ stage: 6, status: { known: false, reason: 'not_in_source' } }),
        milestone({ stage: 7, status: { known: false, reason: 'not_in_source' } }),
      ]),
      scale,
    )
    const stages = [
      ...plot.actualMarkers.map((m) => m.stage),
      ...plot.actualSpans.map((m) => m.stage),
      ...plot.plannedMarkers.map((m) => m.stage),
    ]
    assert.deepEqual(stages, [2])
  })

  test('plottability is decided from dates, not from status', () => {
    assert.equal(hasPlottableDates([item([milestone({ stage: 1 })])]), false)
    assert.equal(
      hasPlottableDates([item([milestone({ stage: 1, actualEnd: { known: true, value: '2026-01-01' } })])]),
      true,
    )
    assert.deepEqual(allDatesOf([item([milestone({ stage: 1 })])]), [])
  })

  test('every stage has a tint, so no bar can render colourless', () => {
    for (const stage of [1, 2, 3, 4, 5, 6, 7] as StageIdDto[]) {
      assert.match(STAGE_TINT[stage], /^#[0-9a-f]{6}$/i)
    }
  })
})

describe('out-of-order source dates', () => {
  test('an inverted actual period is drawn as a marker, not a bar', () => {
    /*
     * Regression. The real export contains a drawing released in January and revised
     * in July; stage 1 then reported a start after its end, and the timeline rendered
     * an 82%-wide bar claiming drawings approval spanned six months. A single date is
     * still worth plotting — a duration the data does not support is not.
     */
    const inverted = milestone({
      stage: 1,
      actualStart: { known: true, value: '2026-07-30' },
      actualEnd: { known: true, value: '2026-01-12' },
    })
    const scale = makeScale(['2026-01-12', '2026-07-30'], '2026-08-13')
    assert.ok(scale)
    const plot = plotItem(item([inverted]), scale)
    assert.equal(plot.actualSpans.length, 0, 'no bar may be drawn from an inverted range')
    assert.equal(plot.actualMarkers.length, 1)
    assert.equal(plot.actualMarkers[0]!.date, '2026-01-12')
  })

  test('an inverted planned period is likewise a marker', () => {
    const inverted = milestone({
      stage: 3,
      plannedStart: { known: true, value: '2026-06-10' },
      plannedEnd: { known: true, value: '2026-04-01' },
    })
    const scale = makeScale(['2026-04-01', '2026-06-10'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(item([inverted]), scale)
    assert.equal(plot.plannedSpans.length, 0)
    assert.equal(plot.plannedMarkers.length, 1)
  })

  test('a same-day period is still drawn, with a visible minimum width', () => {
    const sameDay = milestone({
      stage: 3,
      actualStart: { known: true, value: '2026-04-20' },
      actualEnd: { known: true, value: '2026-04-20' },
    })
    const scale = makeScale(['2026-04-20'], '2026-05-01')
    assert.ok(scale)
    const plot = plotItem(item([sameDay]), scale)
    assert.equal(plot.actualSpans.length, 1)
    assert.ok(plot.actualSpans[0]!.widthPct >= 0.4)
  })
})
