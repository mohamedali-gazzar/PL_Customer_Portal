import type { MilestoneDto, StageIdDto } from '@/dto/common'
import type { ProjectItemDto } from '@/dto/project-detail'

/**
 * The timeline's geometry, separated from its markup so it can be unit-tested.
 *
 * Positions are percentages of the time domain. The component applies them with
 * `inset-inline-start`, which the browser mirrors under `dir="rtl"` — so time flows
 * right-to-left in Arabic with no second coordinate system here.
 */

const DAY = 86_400_000

export function epoch(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`)
}

export interface Scale {
  readonly min: number
  readonly max: number
  /** 0–100. */
  pct(isoDate: string): number
}

export function makeScale(dates: readonly string[], today: string): Scale | null {
  const stamps = dates.map(epoch).filter((n) => !Number.isNaN(n))
  if (stamps.length === 0) return null

  // `today` is always inside the domain, so the Today line is never clipped and never
  // lands exactly on an edge where its label would overflow the plot.
  stamps.push(epoch(today))

  const min = startOfMonth(Math.min(...stamps))
  let max = startOfMonth(addMonths(Math.max(...stamps), 1))
  // A very narrow domain would make every marker overlap; give it room.
  if (max - min < 30 * DAY) max = min + 90 * DAY

  const span = max - min
  return {
    min,
    max,
    pct: (isoDate) => {
      const at = epoch(isoDate)
      if (Number.isNaN(at)) return 0
      return Math.min(100, Math.max(0, ((at - min) / span) * 100))
    },
  }
}

export function startOfMonth(stamp: number): number {
  const d = new Date(stamp)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export function addMonths(stamp: number, months: number): number {
  const d = new Date(stamp)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)
}

export function monthTicks(scale: Scale): string[] {
  const ticks: string[] = []
  let cursor = scale.min
  // Bounded: a ten-year domain is 120 iterations.
  for (let i = 0; i < 240 && cursor < scale.max; i += 1) {
    ticks.push(new Date(cursor).toISOString().slice(0, 10))
    cursor = addMonths(cursor, 1)
  }
  return ticks
}

export interface Marker {
  stage: StageIdDto
  date: string
  pct: number
}

export interface Span {
  stage: StageIdDto
  from: string
  to: string
  fromPct: number
  widthPct: number
}

export interface DelayBar extends Span {
  days: number
}

export interface ItemPlot {
  plannedMarkers: Marker[]
  plannedSpans: Span[]
  actualSpans: Span[]
  actualMarkers: Marker[]
  delays: DelayBar[]
  isEmpty: boolean
}

/**
 * Turn one item's milestones into drawable geometry.
 *
 * Planned dates become *markers*, not bars, whenever only the finish is known — which
 * is every case in the current source, because it records a planned end for material
 * and manufacturing and no planned start for any stage. Drawing a bar would require
 * inventing a start date; a diamond states exactly the one date that exists.
 */
export function plotItem(item: ProjectItemDto, scale: Scale): ItemPlot {
  const plot: ItemPlot = {
    plannedMarkers: [],
    plannedSpans: [],
    actualSpans: [],
    actualMarkers: [],
    delays: [],
    isEmpty: true,
  }

  for (const m of item.milestones) {
    if (m.plannedStart.known && m.plannedEnd.known && ordered(m.plannedStart.value, m.plannedEnd.value)) {
      plot.plannedSpans.push(span(m.stage, m.plannedStart.value, m.plannedEnd.value, scale))
    } else if (m.plannedEnd.known) {
      plot.plannedMarkers.push(marker(m.stage, m.plannedEnd.value, scale))
    }

    if (m.actualStart.known && m.actualEnd.known && ordered(m.actualStart.value, m.actualEnd.value)) {
      plot.actualSpans.push(span(m.stage, m.actualStart.value, m.actualEnd.value, scale))
    } else if (m.actualEnd.known) {
      /*
       * Falls through to a marker when the two dates are out of order.
       *
       * The export demonstrably contains such rows — the adapter counts them as a
       * diagnostic. A bar drawn between them would be a period the data does not
       * support, and `span()` normalising the direction would hide the problem rather
       * than decline to draw it. One date is still worth showing; a fabricated
       * duration is not.
       */
      plot.actualMarkers.push(marker(m.stage, m.actualEnd.value, scale))
    } else if (m.actualStart.known) {
      plot.actualMarkers.push(marker(m.stage, m.actualStart.value, scale))
    }

    // Overrun, only where both ends are real dates. Never extrapolated from "today":
    // an in-progress stage that is already past its planned end is not drawn as delay,
    // because the source cannot say when it will actually finish.
    if (m.plannedEnd.known && m.actualEnd.known && m.varianceDays.known && m.varianceDays.value > 0) {
      plot.delays.push({ ...span(m.stage, m.plannedEnd.value, m.actualEnd.value, scale), days: m.varianceDays.value })
    }
  }

  plot.isEmpty =
    plot.plannedMarkers.length === 0 &&
    plot.plannedSpans.length === 0 &&
    plot.actualSpans.length === 0 &&
    plot.actualMarkers.length === 0
  return plot
}

function marker(stage: StageIdDto, date: string, scale: Scale): Marker {
  return { stage, date, pct: scale.pct(date) }
}

/** A period is only drawable when its start really precedes its end. */
function ordered(from: string, to: string): boolean {
  return epoch(from) <= epoch(to)
}

function span(stage: StageIdDto, from: string, to: string, scale: Scale): Span {
  const fromPct = scale.pct(from)
  const toPct = scale.pct(to)
  return {
    stage,
    from,
    to,
    fromPct: Math.min(fromPct, toPct),
    // A same-day span would otherwise be invisible.
    widthPct: Math.max(Math.abs(toPct - fromPct), 0.4),
  }
}

/** A three-step ramp: only stages 1–3 carry dates in the current source. */
export const STAGE_TINT: Record<StageIdDto, string> = {
  1: '#f0a26a',
  2: '#e2762c',
  3: '#c9490a',
  4: '#a03a0c',
  5: '#7d3411',
  6: '#5d2b12',
  7: '#3f2011',
}

export function datesOf(m: MilestoneDto): string[] {
  const out: string[] = []
  if (m.plannedStart.known) out.push(m.plannedStart.value)
  if (m.plannedEnd.known) out.push(m.plannedEnd.value)
  if (m.actualStart.known) out.push(m.actualStart.value)
  if (m.actualEnd.known) out.push(m.actualEnd.value)
  return out
}

/** True when at least one item carries a date, i.e. there is anything to plot. */
export function hasPlottableDates(items: readonly ProjectItemDto[]): boolean {
  return items.some((item) => item.milestones.some((m) => datesOf(m).length > 0))
}

export function allDatesOf(items: readonly ProjectItemDto[]): string[] {
  return items.flatMap((item) => item.milestones.flatMap(datesOf))
}
