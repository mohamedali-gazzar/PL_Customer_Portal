/**
 * The panel's journey, as a row of stage cards.
 *
 * One card per stage, its steps listed inside with the date each completed. This
 * replaces a flat ladder of milestones: a stage is owned by one team and can take
 * several steps to clear, and collapsing that to one line per step lost which team
 * held the work.
 *
 * Which stage an item is on comes from the report, not from here — see
 * `milestones.ts`. What this file decides is presentation: which dates to show,
 * how long each stage took, and what to say when the report has no date for
 * something.
 */

import {
  PARALLEL_PAIR,
  PRODUCTION_STAGES,
  stageDates,
  STAGE_DELIVERY,
  STAGE_MODIFICATION,
  stageState,
  stepState,
  stagesFor,
  visibleStageOf,
  type LevelState,
  type StageSpec,
} from './milestones'
import { deliveryState } from './derive'
import type { CustomerItem } from './types'

export type { LevelState }

/**
 * An ordinal ramp: one hue, brightening monotonically, so position in the journey
 * is carried by lightness alone and survives greyscale and colour-vision
 * deficiency. It brightens rather than darkens because the interface ground is
 * near-black — a darkening ramp vanished into it. Stage 0 is neutral, because
 * placing an order is a moment rather than a phase. Indexed by report stage.
 */
export const JOURNEY_HEX = [
  '#949496', '#9C5228', '#A85B2E', '#B4642F', '#C06B31', '#CC7434',
  '#D8813E', '#E2914F', '#EAA268', '#F0B183', '#F4C098', '#F7CEAE',
] as const

export interface JourneyStep {
  readonly no: number
  readonly label: string
  /** Translation key. The label is the English fallback. */
  readonly labelKey: string
  /**
   * The date to show: when it concluded, or when it opened while it is still
   * running. Null when the report carries neither.
   */
  readonly on: string | null
  /** v8's two fields, kept apart so the card can say which end it has. */
  readonly started: string | null
  readonly ended: string | null
  /** v8's per-step state, read from those two fields. */
  readonly state: LevelState
  readonly done: boolean
  /** A qualifier the step carries, e.g. the material status. */
  readonly note: string | null
}

export interface JourneyStage {
  /**
   * True when this card stands in for the production stages because no work order
   * exists. It carries no dates and must not be read as a delay.
   */
  readonly unrecorded?: boolean
  /**
   * Set on both cards when v8's parallel pair is running at once, so the UI can
   * say why. Two lit cards with no explanation reads as a fault; v8 is explicit
   * that it is not one.
   */
  readonly alongside?: number
  /**
   * The report's own stage number. Internal identity — the ladder, the weights
   * and the colour ramp are all indexed by it.
   */
  readonly n: number
  /**
   * What the badge shows: this stage's position in the strip the customer is
   * actually looking at, counting from 1.
   *
   * The report's numbering has holes once Financial Check is hidden and a
   * modification is absent — a customer would read 0, 1, 2, 3, 4, 5, 6, 7, 8, 11
   * and reasonably ask what happened to 9 and 10.
   */
  readonly pos: number
  readonly label: string
  readonly team: string
  /** Translation keys. The plain strings above are the English fallbacks. */
  readonly labelKey: string
  readonly teamKey: string
  readonly statusKey: string
  readonly state: LevelState
  /** The step wording the report gave, on the active card only. */
  readonly status: string
  readonly from: string | null
  readonly to: string | null
  /** Days the stage took, or has been open for. */
  readonly days: number | null
  readonly planned: string | null
  readonly what: string
  readonly steps: readonly JourneyStep[]
}

const DAY = 86_400_000
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const span = (a: string | null, b: string | null): number | null =>
  a && b ? Math.round((at(b) - at(a)) / DAY) : null

/** Indexed by report stage number. */
const WHAT = [
  'The day you placed this order with us.',
  'Our engineers draw the panel and send it to you for approval.',
  'The drawing is with you. Nothing can be built until it comes back approved.',
  'The approved drawing is verified and released to the shop floor as a work order.',
  'Planning checks what is in stock against what your panel needs.',
  'Procurement brings in everything the panel is missing.',
  'Your panel is assembled and wired on the production line.',
  'The panel is inspected, and any final adjustments are made.',
  'Factory Acceptance Test — the panel is signed off before it leaves.',
  'The panel is back on the bench for an adjustment before it ships.',
  '',
  'The panel is released, packed, dispatched, and delivered to your site.',
] as const

/**
 * Stage 2 is the one waiting on the customer rather than on us. It says so while
 * it is the stage being waited on, and reverts to its neutral name once passed —
 * "Waiting for approval to proceed" over a completed card contradicts itself.
 */
const APPROVAL_STAGE = 2
const APPROVAL_WAITING_TITLE = 'Waiting for approval to proceed'
const APPROVAL_WAITING_TAG = 'Pending Approval'

/** Said of a completed stage the report carries no date for. */
const NOT_RECORDED = 'Not recorded'

export function journeyOf(item: CustomerItem, today: string): JourneyStage[] {
  const fullyDelivered = deliveryState(item.deliv, item.qty) === 'delivered'
  const hasRework = item.rework > 0
  const active = visibleStageOf(item.stage)

  /* No work order means no production documents to date the middle stages from.
     Their cards say so plainly instead of showing five empty ones, which reads as
     a stall rather than as a factory record that was never opened. */
  const noProduction = item.mainWos === 0

  const out: JourneyStage[] = []
  let previousEnd: string | null = null

  for (const spec of stagesFor(hasRework)) {
    // v8's rule: the card is read from its own two fields, and only falls back to
    // the ladder where those fields are empty. See `stageState`.
    const dates = stageDates(spec, item.sd)
    const state = stageState(spec.no, item.stage, fullyDelivered, dates)
    const pending = state === 'pending'

    const steps = spec.steps.map((x) => {
      /* State from the report, dates from the export.
         A step's position relative to `step_code` says whether it is finished; its
         own two columns only supply the days to print. Where a column is empty the
         date is simply omitted — a gap in the record does not walk the step back
         to Not started. */
      const stepAt = stepState(x.no, state, item.stepCode)
      const started = item.sd[x.startAt] ?? null
      const ended = item.sd[x.endAt] ?? null
      return {
        no: x.no,
        label: x.label,
        labelKey: x.labelKey,
        // The date a step shows is the day it concluded, falling back to the day
        // it opened while it is still running. Null when neither was recorded.
        on: ended ?? started,
        started,
        ended,
        state: stepAt,
        done: stepAt === 'done',
        note: noteFor(spec, x.no, item),
      }
    })

    /* Where the stage's segment is drawn — geometry, not status.
       A segment runs from where the previous stage ended, because that is the
       elapsed time this stage is answerable for. It has no bearing on whether the
       stage reads Completed: that is `state`, and it comes from the two fields
       above and nothing else. */
    const to = dates.end
    const from = dates.start ?? previousEnd ?? dates.end

    const waiting = spec.no === APPROVAL_STAGE && state === 'active'

    /* Whether the report's headline is about this card. Everything the report
       says about "the current stage" applies here and nowhere else. */
    const headline = spec.no === visibleStageOf(item.stage)
    const status = statusOf(spec, state, to, item, waiting, headline)

    out.push({
      n: spec.no,
      pos: out.length + 1,
      label: waiting ? APPROVAL_WAITING_TITLE : spec.name,
      labelKey: waiting ? 'stage.2.waiting' : spec.nameKey,
      team: spec.team,
      teamKey: spec.teamKey,
      state,
      status,
      /* A card running in parallel takes its status from its own step, so its key
         is that step's — the status-string lookup only knows the report's
         vocabulary, and this wording never came from the report. */
      statusKey:
        state === 'active' && !headline && spec.no !== STAGE_MODIFICATION
          ? (spec.steps[spec.steps.length - 1]?.labelKey ?? statusKeyOf(status))
          : statusKeyOf(status),
      from,
      to: pending ? null : to,
      /* The running counter comes from the report, which measures it against the
         same clock as everything else in the export — but only for the stage the
         report is counting. A second card running in parallel is not in that
         count, so it is measured from its own start instead of borrowing a
         number that belongs to its neighbour. */
      /* `days_in_current_stage`, read, for the stage the report names as current.
         The report measures it against the same clock as everything else in the
         export, and v8 is explicit that the portal must not recompute it. The one
         other card that can be running — the trailing half of v8's parallel pair —
         is outside that count, so it is measured from its own start. */
      days:
        state === 'done'
          ? span(from, to)
          : state === 'active'
            ? headline
              ? (item.dis ?? span(item.since ?? from, today))
              : span(from, today)
            : null,
      planned: plannedFor(spec.no, item),
      what: WHAT[spec.no] ?? '',
      steps,
      ...(noProduction && PRODUCTION_STAGES.includes(spec.no) ? { unrecorded: true } : {}),
    })

    if (to) previousEnd = to
  }

  /* v8's PARALLEL RULE, made visible.
     Material Readiness and Manufacturing can both be running: production starts on
     partially available material while procurement keeps buying. When that happens
     each card is told which other card it is sharing the floor with, so the UI can
     say so rather than leaving two lit cards looking like a contradiction. */
  const [a, b] = PARALLEL_PAIR
  const cardA = out.find((x) => x.n === a)
  const cardB = out.find((x) => x.n === b)
  if (cardA?.state === 'active' && cardB?.state === 'active') {
    return out.map((x) =>
      x.n === a ? { ...x, alongside: b } : x.n === b ? { ...x, alongside: a } : x,
    )
  }

  return out
}

function statusOf(
  spec: StageSpec,
  state: LevelState,
  to: string | null,
  item: CustomerItem,
  waiting: boolean,
  /**
   * True when this card is the one the report's headline is about.
   *
   * v8 is explicit that the report owns Current Step and Days In Current Stage,
   * and the portal must not recompute them. But those two fields describe one
   * stage, and under the parallel rule two cards can be running. Handing the
   * report's answer to both makes the trailing card claim the leading card's
   * step — "Material Readiness · In production" — and its day count.
   */
  headline: boolean,
): string {
  if (waiting) return APPROVAL_WAITING_TAG

  const partial = deliveryState(item.deliv, item.qty) === 'partial'
  if (spec.no === STAGE_DELIVERY && partial && state !== 'pending') return 'Partially delivered'

  if (state === 'active') {
    if (spec.no === STAGE_MODIFICATION) return 'Item under modification'
    // The report's step, but only for the stage the report is describing.
    if (headline) return item.step ?? 'In progress'
    // The other running card speaks for itself, in its own step's words.
    return spec.steps[spec.steps.length - 1]?.label ?? 'In progress'
  }
  if (state === 'pending') return 'Not started'

  if (spec.no === STAGE_MODIFICATION) return to ? 'Modification complete' : NOT_RECORDED
  if (spec.no === STAGE_DELIVERY) return 'Delivered'
  return to ? 'Complete' : NOT_RECORDED
}

/**
 * The translation key for a status string.
 *
 * A lookup rather than a second switch: `statusOf` already decided what to say,
 * and re-deriving the key from the same inputs would be two rules to keep in step.
 * An unmapped status falls through to its English, which is visible and reportable
 * rather than silently blank.
 */
const STATUS_KEYS: Readonly<Record<string, string>> = {
  'Pending Approval': 'now.pendingApproval',
  'Item under modification': 'now.underModification',
  'Modification complete': 'now.modificationComplete',
  'Partially delivered': 'now.partiallyDelivered',
  Delivered: 'now.delivered',
  Complete: 'now.complete',
  'Not recorded': 'now.notRecorded',
  'Not started': 'now.notStarted',
  'In progress': 'now.inProgress',
  'Order confirmed': 'now.orderConfirmed',
  'Sent to you for approval': 'now.sentToYou',
  'Approved by you': 'now.approvedByYou',
  'Design verified': 'now.designVerified',
  'Released to production': 'now.released',
  'Material checked': 'now.materialChecked',
  'Material fully available': 'now.materialAvailable',
  'In production': 'now.inProduction',
  'Production complete': 'now.productionComplete',
  'Quality check in progress': 'now.qualityCheck',
  'FAT passed': 'now.fatPassed',
  'Preparing for dispatch': 'now.preparingDispatch',
  'Ready for delivery': 'now.readyForDelivery',
}

export function statusKeyOf(status: string): string {
  return STATUS_KEYS[status] ?? ''
}

/** A qualifier a step carries beyond its date. */
/**
 * The ERP's material-status vocabulary, mapped to keys.
 *
 * Three values in a closed set, so they are translated rather than printed. An
 * unrecognised value keeps its own text: a new status appearing in the export
 * should be visible and reported, not silently blanked.
 */
export const MATERIAL_KEYS: Readonly<Record<string, string>> = {
  Available: 'material.available',
  'Partially Available': 'material.partial',
  'Not Available': 'material.none',
}

function noteFor(spec: StageSpec, stepNo: number, item: CustomerItem): string | null {
  // "Material Checked · Partially Available" — the outcome is the point of the
  // step, and without it the card says a check happened but not what it found.
  if (spec.no === 4 && stepNo === 5) return item.matStatus ?? null
  return null
}

/** The translation key for a material status, where we recognise it. */
export function materialKeyOf(status: string | null | undefined): string {
  return (status && MATERIAL_KEYS[status]) ?? ''
}

/** The planned date a stage is measured against, where the report carries one. */
function plannedFor(stageNo: number, item: CustomerItem): string | null {
  if (stageNo === 5) return item.st[1]?.[4] ?? null
  if (stageNo === 6) return item.st[2]?.[4] ?? null
  if (stageNo === STAGE_DELIVERY) return item.cDate
  return null
}
