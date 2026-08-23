/**
 * The timeline bar, as segments.
 *
 * Split out of `Timeline.tsx` because it is pure geometry over the journey and
 * none of it needs React — and because Node's type stripping cannot load a
 * `.tsx`, so a tested module has to be plain TypeScript.
 */

import { deliveryState } from './derive'
import { journeyOf } from './journey'
import { PARALLEL_PAIR, STAGE_DELIVERY } from './milestones'
import type { CustomerItem } from './types'

/** The planned date a stage is measured against, where the report carries one. */
export function plannedForStage(stageNo: number, item: CustomerItem): string | null {
  if (stageNo === 5) return item.st[1]?.[4] ?? null
  if (stageNo === 6) return item.st[2]?.[4] ?? null
  if (stageNo === STAGE_DELIVERY) return item.cDate
  return null
}

/* --------------------------------------------------------------- families -- */

/**
 * Stages grouped into the families the bar speaks in.
 *
 * The cards name every stage; the bar names families, because five or six bands is
 * a shape you can read at a glance and eleven is a barcode. "Drawings · 33d" is
 * Drawing Creation, Drawings Approval and Design Verification added together.
 *
 * Colours are the spec's own, taken from the mockups rather than approximated.
 */
export interface Family {
  readonly key: string
  readonly label: string
  /** Translation key; `label` is the English fallback. */
  readonly labelKey: string
  readonly hex: string
}

const NOT_STARTED: Family = { key: 'none', label: 'Not started', labelKey: 'bar.notStarted', hex: '#B8B2A7' }
const DRAWINGS: Family = { key: 'drawings', label: 'Drawings', labelKey: 'bar.drawings', hex: '#5C6B57' }
const MATERIAL: Family = { key: 'material', label: 'Material', labelKey: 'bar.material', hex: '#7A5230' }
const MANUFACTURING: Family = { key: 'manufacturing', label: 'Manufacturing', labelKey: 'bar.manufacturing', hex: '#96602F' }
const QUALITY: Family = { key: 'quality', label: 'Quality + FAT', labelKey: 'bar.quality', hex: '#A87038' }
/** No colour is given for this in the spec; the brand's own orange marks it out. */
const MODIFICATION: Family = { key: 'modification', label: 'Item Under Modification', labelKey: 'bar.modification', hex: '#C44A05' }
const DELIVERY: Family = { key: 'delivery', label: 'Ready / Delivered', labelKey: 'bar.delivery', hex: '#2E7D53' }

export const FAMILIES: readonly Family[] = [
  NOT_STARTED, DRAWINGS, MATERIAL, MANUFACTURING, QUALITY, MODIFICATION, DELIVERY,
]

/** Which family a report stage belongs to. */
export function familyOf(stage: number): Family {
  if (stage <= 0) return NOT_STARTED
  if (stage <= 3) return DRAWINGS
  if (stage <= 5) return MATERIAL
  if (stage === 6) return MANUFACTURING
  if (stage <= 8) return QUALITY
  if (stage === 9) return MODIFICATION
  return DELIVERY
}

/* ------------------------------------------------------------------ bands -- */

export interface Band {
  /** Report stage number of the first stage in the band. */
  stage: number
  /** What it is called: the stage's own name, or the family's once merged. */
  label: string
  /** Translation key for that name. */
  labelKey: string
  family: Family
  from: string
  to: string
  /** Still running: it ends at today rather than at a recorded date. */
  open?: boolean
  /** This stage is waiting on the customer, not on us. */
  withYou?: boolean
  /**
   * How many stages of elapsed time this band represents.
   *
   * More than one when stages recorded no date of their own and their time was
   * absorbed by the stage that closed it, or when finished stages of a family were
   * folded together. A band covering several stages is named for the family, not
   * for whichever one happened to end it.
   */
  spans: number
  what?: string
}

/**
 * One segment per stage, which is where the whole story lives.
 *
 * The bar used to be cut by T-phase, which is the ERP's own measurement vocabulary
 * and did not line up with the cards above it — the reader had to translate between
 * two different divisions of the same time. Now the two agree: a segment is a card.
 *
 * Two realities of production data are handled rather than hidden. Dates can arrive
 * out of order, so the sequence is forced monotonic and a bar can never be drawn
 * running backwards. And a stage with no recorded dates contributes no segment at
 * all, rather than a guessed boundary putting a number on something nobody wrote
 * down — which is why a delivered item, whose middle stages this export cannot
 * evidence, draws fewer segments than it has cards.
 */
export function buildBands(item: CustomerItem, today: string): Band[] {
  const stages = journeyOf(item, today)
  const bands: Band[] = []

  /* v8's parallel pair, flattened for the bar.
     Material Readiness and Manufacturing can both be in progress — v8's PARALLEL
     RULE, and the cards above show both. A bar cannot: it partitions one axis of
     time, so two running segments would count the same fortnight twice and hand a
     duration to whichever stage did not own it.

     v8 says which one owns the headline: "The headline Current Stage from the
     report will read Manufacturing in that situation, because the ladder picks the
     furthest point reached. That is the right headline; the two cards below it
     tell the fuller story." So the running segment is Manufacturing's, and
     Material Readiness hands over where Manufacturing began rather than running
     alongside it. No time is invented and none is double-counted. */
  const [trailing, leading] = PARALLEL_PAIR
  const overlap =
    stages.find((s) => s.n === trailing)?.state === 'active' &&
    stages.find((s) => s.n === leading)?.state === 'active'
  const handover = overlap ? (stages.find((s) => s.n === leading)?.from ?? null) : null

  let cursor: string | null = null
  /**
   * Stages passed since the last band, whose elapsed time this one will absorb.
   *
   * Only stages that actually consumed time count. Order Creation is a moment —
   * it opens and closes the same day — so it contributes nothing to absorb, and
   * counting it would make the band after it look like two stages' worth of work
   * and take the family's name instead of its own.
   */
  let absorbed = 0

  for (const st of stages) {
    /* A stage with neither field stamped draws nothing, but the time between the
       stage before it and the stage after it is still real, so the band that does
       close hands over across it and takes the family's name. Skipping without
       counting made a two-stage span read as one, and credited the whole wait to
       whichever stage happened to write the closing date. */
    if (st.state === 'pending') {
      if (cursor) absorbed += 1
      continue
    }

    /* A segment runs from where the previous stage ended to where this one ended
       — the elapsed time the stage is answerable for, which is what the bar is
       measuring. Its own first date is only the fallback for the very first
       segment, where there is no previous stage to hand over from.

       Taking the stage's own start instead made every stage that records a single
       date zero pixels wide, and drew nothing at all for the 647 delivered items
       whose stages each carry one timestamp. Where the stages in between recorded
       nothing, their time is absorbed by the stage that closed it: we know the work
       was finished by that date and not when it began, and attributing the gap to
       the stage that ended it is the one reading that invents no boundary. */
    const rawFrom: string | null = cursor ?? st.from
    if (!rawFrom) continue
    const from: string = rawFrom

    /* The trailing half of an overlap is drawn as closed at the handover, though
       its card above stays in progress — see the note at the top of this function. */
    const parallelTrailing = overlap && st.n === trailing
    const open = st.state === 'active' && !parallelTrailing
    const rawTo: string | null = parallelTrailing ? handover : open ? today : st.to
    if (!rawTo) {
      absorbed += 1 // no date of its own; the next stage absorbs its time
      continue
    }
    const to: string = rawTo < from ? from : rawTo
    if (to <= from && !open) {
      cursor = to // a moment, not a span: no time for anyone to absorb
      continue
    }

    bands.push({
      stage: st.n,
      label: st.label,
      labelKey: st.labelKey,
      family: familyOf(st.n),
      from,
      to,
      ...(open ? { open: true } : {}),
      // The one segment that is the customer's own clock. Naming it is the point
      // of the bar: 6 days of a 60-day contract can be sitting on one signature.
      ...(open && st.n === 2 ? { withYou: true } : {}),
      ...(st.what ? { what: st.what } : {}),
      spans: absorbed + 1, // the stage itself, plus any whose time it swallowed
    })
    cursor = to
    absorbed = 0
  }

  /* The time nobody has claimed.
     A stage closes when its end date is stamped, and the next one opens when its
     own start is. Between those two the item is somewhere the model has no name
     for — and on 69 open lines that gap is the largest thing on the bar, up to 696
     days. Ending the axis at the last stamp drew a bar that stopped a year before
     today and said nothing about the year in between.

     It is drawn as its own neutral segment rather than by stretching the last
     stage: FAT did not take 417 days, it took 21 and then the item sat. Extending
     the stage would hand it a duration it did not earn, which is the one thing the
     bar must never do. */
  const shipped = deliveryState(item.deliv, item.qty) === 'delivered'
  const tail = bands[bands.length - 1]
  if (!shipped && tail && !tail.open && tail.to < today) {
    bands.push({
      stage: tail.stage,
      label: STALLED,
      labelKey: 'bar.stalled',
      family: NOT_STARTED,
      from: tail.to,
      to: today,
      open: true,
      spans: 1,
    })
  }

  return merge(bands)
}

/** What the unclaimed tail is called. Never a stage — nothing has been recorded. */
const STALLED = 'No update recorded'

/**
 * Fold consecutive finished stages of the same family into one band.
 *
 * A band covering more than one stage takes the family's name — "Drawings · 33d";
 * a band that is only one stage keeps that stage's own — "Drawing Creation · 16d".
 * Both readings appear in the spec's mockups, and this is what reconciles them.
 *
 * The running stage is never folded in. It is the answer to "where is my panel",
 * and burying it inside a family would lose the one segment the reader came for —
 * including the "with you" band, which is the whole point of the bar.
 */
function merge(bands: readonly Band[]): Band[] {
  const out: Band[] = []
  for (const b of bands) {
    const last = out[out.length - 1]
    const mergeable = last && !last.open && !b.open && last.family.key === b.family.key
    if (mergeable) {
      out[out.length - 1] = {
        ...last,
        to: b.to,
        spans: last.spans + b.spans,
        label: last.family.label,
        labelKey: last.family.labelKey,
        // The tooltip's explanation belonged to one stage; a merged band covers
        // several, so it says what it covers instead of picking one.
        what: `${last.family.label} covers every stage from ${last.label} to ${b.label}.`,
      }
      continue
    }
    /* A finished band that swallowed the stages before it is named for the family:
       calling it "Material Readiness" when it covers planning as well would credit
       the whole wait to whichever stage happened to record the closing date.

       The running band is exempt however much it covers. It answers "where is my
       panel", and "Drawings" in place of "Design Verification" loses precisely the
       thing the reader came for. Both mockups name the running band for its own
       stage — "Drawings Approval · with you · 6d", "Financial Check · 16d". */
    const folded = !b.open && b.spans > 1
    out.push({
      ...b,
      label: folded ? b.family.label : b.label,
      labelKey: folded ? b.family.labelKey : b.labelKey,
    })
  }
  return out
}
