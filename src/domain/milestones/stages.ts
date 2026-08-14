/**
 * The 7-stage rule engine — a direct transcription of PDF §4.
 *
 * Every rule below quotes the brief it implements. Nothing here reads a stored
 * status field: PDF §8.5 is explicit that `custom_item_status` exists but is
 * unused and must stay unused, because the portal *computes* status. The go-live
 * gate is "every status reproducible from ERPNext documents by the Section 4
 * rules — zero manually maintained statuses".
 *
 * Two rules are applied throughout:
 *
 *  1. If the active provider cannot supply a stage's evidence, the status is
 *     `unknown` and `derivation` is `unavailable`. It is never defaulted to a
 *     concrete value, because "Not paid" or "Not delivered" would be a false
 *     factual claim about a real order.
 *  2. If the provider *can* derive the stage but cannot observe its completion,
 *     `derivation` is `partial` — the status is a lower bound and the stage is
 *     excluded from progress arithmetic.
 *
 * All rules are pure functions of their input. No I/O, no clock reads except the
 * injected `today`.
 */

import {
  known,
  notInSource,
  pending,
  isKnown,
  type Maybe,
} from '../model/maybe'
import { diffDays, type PlainDate } from '../model/plain-date'
import type { ProviderCapabilities } from '../model/capabilities'
import type { OrderLine, ProductionRecord } from '../model/entities'
import {
  STAGE_KEYS,
  type Milestone,
  type MilestoneDerivation,
  type MilestoneProvenance,
  type MilestoneStatus,
  type StageId,
} from '../model/milestone'

export interface StageInput {
  readonly line: OrderLine
  readonly capabilities: ProviderCapabilities
  readonly today: PlainDate
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

interface MilestoneDraft {
  status: Maybe<MilestoneStatus>
  derivation: MilestoneDerivation
  plannedStart?: Maybe<PlainDate>
  plannedEnd?: Maybe<PlainDate>
  actualStart?: Maybe<PlainDate>
  actualEnd?: Maybe<PlainDate>
  provenance?: MilestoneProvenance
  isComplete?: boolean
}

function milestone(stage: StageId, draft: MilestoneDraft): Milestone {
  const plannedEnd = draft.plannedEnd ?? notInSource()
  const actualEnd = draft.actualEnd ?? notInSource()

  // Variance is only ever a subtraction of two known dates. It is never
  // estimated, extrapolated from "today", or defaulted to 0.
  const varianceDays: Maybe<number> =
    isKnown(plannedEnd) && isKnown(actualEnd)
      ? known(diffDays(plannedEnd.value, actualEnd.value))
      : notInSource('variance needs both a planned and an actual end date')

  return {
    stage,
    key: STAGE_KEYS[stage],
    status: draft.status,
    derivation: draft.derivation,
    plannedStart: draft.plannedStart ?? notInSource(),
    plannedEnd,
    actualStart: draft.actualStart ?? notInSource(),
    actualEnd,
    varianceDays,
    provenance: draft.provenance ?? {},
    isComplete: draft.isComplete ?? false,
  }
}

/** A stage this provider cannot derive at all. */
function unavailableStage(stage: StageId, note: string): Milestone {
  return milestone(stage, {
    status: notInSource(note),
    derivation: 'unavailable',
    plannedStart: notInSource(note),
    plannedEnd: notInSource(note),
    actualStart: notInSource(note),
    actualEnd: notInSource(note),
  })
}

/** A line with no production journey (loose components — 37 rows in the export). */
function noProductionStage(stage: StageId): Milestone {
  return milestone(stage, {
    status: { state: 'unknown', reason: 'not_applicable', note: 'line has no work order' },
    derivation: 'unavailable',
  })
}

/* ───────────────── Stage 1 — Drawings Approval (PDF §4.1) ───────────────
 *
 *   Under preparation   default, no RFD event yet
 *   Sent for approval   RFD submitted with type "Initial Approval" or "Revision"
 *                       planned date: request_due_date
 *   Approved            an RFD of type "Release/Released" exists (draft or later)
 *                       date: custom_approval_date
 */
export function deriveStage1(input: StageInput): Milestone {
  const { line, capabilities, today } = input
  if (!capabilities.drawings) {
    return unavailableStage(1, 'source has no Request For Design data')
  }
  if (line.production === null) return noProductionStage(1)

  const d = line.production.drawings
  const planned = capabilities.plannedDates.drawings
    ? d.requestDueOn
    : notInSource('RFD request_due_date is not in this source')

  const released = isKnown(d.hasRelease) ? d.hasRelease.value : isKnown(d.releasedOn)

  if (released) {
    /*
     * The *earliest* submission, not the latest.
     *
     * The export carries one date per RFD type, and a revision can be dated after the
     * release — a drawing approved in January and revised in July. Taking the latest
     * submission there would produce a stage that starts after it ends, which the
     * timeline would render as a six-month drawings-approval bar. The first time the
     * drawings went to the customer is the honest start of the stage, and it is always
     * on or before the release.
     *
     * The status stays "approved" per §4 ("a Release RFD exists"): with only one date
     * per type there is no evidence about whether the later revision was itself
     * released, so inferring a fresh approval cycle would be a guess.
     */
    return milestone(1, {
      status: known('approved'),
      derivation: 'evidence',
      plannedEnd: planned,
      actualStart: earliestOf(d.initialSubmittedOn, d.revisionSubmittedOn),
      actualEnd: d.releasedOn,
      isComplete: true,
      provenance: {
        status: 'rfd.type=Release exists',
        actualStart: 'rfd.custom_submission_date (first submission)',
        actualEnd: 'rfd.custom_approval_date',
      },
    })
  }

  // Not yet released: the most recent submission is what the customer is sitting on.
  const submittedOn = latestOf(d.initialSubmittedOn, d.revisionSubmittedOn)
  if (isKnown(submittedOn)) {
    return milestone(1, {
      status: known('sent_for_approval'),
      derivation: 'evidence',
      plannedEnd: planned,
      actualStart: submittedOn,
      actualEnd: pending('awaiting customer approval'),
      provenance: {
        status: 'rfd.type in (Initial Approval, Revision) submitted',
        actualStart: 'rfd.custom_submission_date (latest submission)',
      },
    })
  }

  return milestone(1, {
    status: known('under_preparation'),
    derivation: 'default',
    plannedEnd: planned,
    provenance: { status: 'PDF §4 default — no RFD event yet' },
  })

  function latestOf(a: Maybe<PlainDate>, b: Maybe<PlainDate>): Maybe<PlainDate> {
    if (isKnown(a) && isKnown(b)) return known(a.value >= b.value ? a.value : b.value)
    if (isKnown(a)) return a
    if (isKnown(b)) return b
    void today
    return pending('drawings not yet submitted')
  }

  function earliestOf(a: Maybe<PlainDate>, b: Maybe<PlainDate>): Maybe<PlainDate> {
    if (isKnown(a) && isKnown(b)) return known(a.value <= b.value ? a.value : b.value)
    if (isKnown(a)) return a
    if (isKnown(b)) return b
    return pending('drawings not yet submitted')
  }
}

/**
 * Whether the customer is the one holding the item up.
 *
 * Drawings were submitted and no release exists yet, so the ball is with them.
 * This is the "NEEDS YOUR ACTION / drawing approval pending" signal on the
 * dashboard, and it is measured the same way the company's own T2 metric is
 * (submission → release), so the portal and the internal report agree.
 */
export function deriveBlockedOnCustomer(
  input: StageInput,
): Maybe<{ reason: 'drawing_approval'; sinceDays: Maybe<number>; since: Maybe<PlainDate> }> {
  const { line, capabilities, today } = input
  if (!capabilities.drawings || line.production === null) {
    return notInSource('source has no Request For Design data')
  }
  const d = line.production.drawings
  const released = isKnown(d.hasRelease) ? d.hasRelease.value : isKnown(d.releasedOn)
  if (released) return pending('nothing awaiting the customer')

  const submitted = isKnown(d.revisionSubmittedOn) ? d.revisionSubmittedOn : d.initialSubmittedOn
  if (!isKnown(submitted)) return pending('drawings not yet submitted')

  const days = diffDays(submitted.value, today)
  return known({
    reason: 'drawing_approval',
    since: submitted,
    // A negative age means the source's own dates are out of order (the export
    // contains such rows). Report it as unknown rather than as a negative wait.
    sinceDays: days >= 0 ? known(days) : notInSource('source dates are out of order'),
  })
}

/* ──────────────── Stage 2 — Material Readiness (PDF §4.2) ───────────────
 *
 *   Material Not Available   default
 *   Partially Available      Work Order material_status = "Partially Available"
 *                            planned date: material_delivery_date
 *   Fully Available          Work Order material_status = "Available"
 *                            date: custom_last_material_transfer_for_manufacture
 */
export function deriveStage2(input: StageInput): Milestone {
  const { line, capabilities } = input
  if (!capabilities.materialStatus) {
    return unavailableStage(2, 'source has no Work Order material status')
  }
  if (line.production === null) return noProductionStage(2)

  const wo = line.production.main
  const planned = capabilities.plannedDates.material
    ? wo.materialPlannedOn
    : notInSource('material_delivery_date is not in this source')

  const base = {
    plannedEnd: planned,
    actualEnd: wo.materialReadyOn,
    provenance: {
      status: 'work_order.material_status',
      plannedEnd: 'work_order.material_delivery_date',
      actualEnd: 'work_order.custom_last_material_transfer_for_manufacture',
    },
  }

  if (!isKnown(wo.materialStatus)) {
    // No work order material status at all: PDF §4 documents the default.
    return milestone(2, {
      ...base,
      status: known('material_not_available'),
      derivation: 'default',
      actualEnd: pending('material not yet transferred'),
      provenance: { status: 'PDF §4 default — no work order material status' },
    })
  }

  switch (wo.materialStatus.value) {
    case 'available':
      return milestone(2, { ...base, status: known('fully_available'), derivation: 'evidence', isComplete: true })
    case 'partially_available':
      return milestone(2, { ...base, status: known('partially_available'), derivation: 'evidence' })
    case 'not_available':
      return milestone(2, {
        ...base,
        status: known('material_not_available'),
        derivation: 'evidence',
        actualEnd: pending('material not yet transferred'),
      })
  }
}

/* ─────────────────── Stage 3 — Manufacturing (PDF §4.3) ─────────────────
 *
 *   Not Started   default                        planned: planned_start_date
 *   In Progress   Work Order status "In Process"  date: actual_start_date
 *   Completed     Work Order status "Completed"   date: custom_manufacture_submission_date
 *                                                planned: planned_end_date
 */
export function deriveStage3(input: StageInput): Milestone {
  const { line, capabilities } = input
  if (!capabilities.manufacturing) {
    return unavailableStage(3, 'source has no Work Order status')
  }
  if (line.production === null) return noProductionStage(3)

  const wo = line.production.main

  const plannedStart = capabilities.plannedDates.manufacturingStart
    ? wo.plannedStartOn
    : notInSource('work_order.planned_start_date is not in this source')
  const plannedEnd = capabilities.plannedDates.manufacturingEnd
    ? wo.plannedEndOn
    : notInSource('work_order.planned_end_date is not in this source')

  /*
   * Actual start.
   *
   * ERPNext has a real `actual_start_date`; this source does not carry it. Where
   * it is missing we fall back to the material-ready date, because that is the
   * company's *own* definition of when the manufacturing phase begins — its T5
   * metric is exactly `manufacturing_complete − material_ready`, which held on
   * 174 of 174 rows in the export. The fallback is recorded in `provenance` so
   * the derivation stays auditable and the UI can label it.
   *
   * Work Order `creation` is deliberately NOT used: it is when the paperwork was
   * raised, not when production started.
   */
  const actualStart = capabilities.actualManufacturingStart
    ? wo.actualStartOn
    : isKnown(wo.materialReadyOn)
      ? wo.materialReadyOn
      : notInSource('work_order.actual_start_date is not in this source')

  const provenance: MilestoneProvenance = {
    status: 'work_order.status',
    plannedStart: 'work_order.planned_start_date',
    plannedEnd: 'work_order.planned_end_date',
    actualStart: capabilities.actualManufacturingStart
      ? 'work_order.actual_start_date'
      : 'work_order.custom_last_material_transfer_for_manufacture (company T5 phase definition)',
    actualEnd: 'work_order.custom_manufacture_submission_date',
  }

  const base = { plannedStart, plannedEnd, actualStart, provenance }
  const completedOn = wo.manufacturingCompletedOn

  if (!isKnown(wo.status)) {
    return milestone(3, {
      ...base,
      status: known('not_started'),
      derivation: 'default',
      actualStart: pending('manufacturing not yet started'),
      actualEnd: pending('manufacturing not yet complete'),
      provenance: { ...provenance, status: 'PDF §4 default — no work order status' },
    })
  }

  switch (wo.status.value) {
    case 'completed':
      return milestone(3, { ...base, status: known('completed'), derivation: 'evidence', actualEnd: completedOn, isComplete: true })

    case 'closed':
      /*
       * `Closed` is not in the §4 rule table (1 row in the export). ERPNext uses
       * it for a work order stopped outside the normal flow, so it is only
       * treated as complete when there is a real completion date to point at.
       */
      return isKnown(completedOn)
        ? milestone(3, {
            ...base,
            status: known('completed'),
            derivation: 'evidence',
            actualEnd: completedOn,
            isComplete: true,
            provenance: { ...provenance, status: 'work_order.status=Closed with a completion date' },
          })
        : milestone(3, {
            ...base,
            status: notInSource('work_order status "Closed" is not covered by the PDF §4 rules'),
            derivation: 'unavailable',
          })

    case 'in_process':
      return milestone(3, { ...base, status: known('in_progress'), derivation: 'evidence', actualEnd: pending('manufacturing in progress') })

    case 'mixed':
      /*
       * Several work orders on one line with differing statuses (28 such rows).
       * Mixed necessarily means some work is advanced and some is not, so
       * `in_progress` is the honest rollup — reporting the most advanced status
       * would overstate progress.
       */
      return milestone(3, {
        ...base,
        status: known('in_progress'),
        derivation: 'evidence',
        actualEnd: pending('not all work orders are complete'),
        provenance: { ...provenance, status: 'work_order.status across several work orders (least advanced wins)' },
      })

    case 'not_started':
      return milestone(3, {
        ...base,
        status: known('not_started'),
        derivation: 'evidence',
        actualStart: pending('manufacturing not yet started'),
        actualEnd: pending('manufacturing not yet complete'),
      })
  }
}

/* ────────────────────── Stage 4 — FAT (PDF §4.4) ───────────────────────
 *
 *   Not Ready            default
 *   FAT Invitation       Work Order status = "Completed"
 *   FAT Success          Stock Entry "Transfer To Finished Goods" submitted
 *   Rework In Progress   a rework WO linked to this item is not "Completed"
 *   Rework Done          "Transfer To Finished Goods" submitted after rework
 *
 * PDF §4 rework detail: the customer sees a neutral status only — never a rework
 * reason or comment. `ReworkSummary` carries nothing else, by design.
 */
export function deriveStage4(input: StageInput): Milestone {
  const { line, capabilities } = input
  if (line.production === null) return noProductionStage(4)

  const prod: ProductionRecord = line.production
  const wo = prod.main
  const manufacturingDone =
    isKnown(wo.status) && (wo.status.value === 'completed' || wo.status.value === 'closed')

  const plannedEnd = capabilities.plannedDates.fat
    ? wo.plannedFatOn
    : notInSource('no planned FAT date field exists yet (PDF §8.1)')

  // Rework in progress is derivable without Stock Entry data, and is the most
  // specific true thing we can say, so it takes precedence over the FAT status.
  const reworkInProgress = prod.rework?.inProgress === true

  if (!capabilities.fatEvents) {
    /*
     * No Stock Entry data, so FAT *success* can never be observed. We can still say
     * truthfully how far the item has got, but every branch here is `partial`:
     * the stage can never complete from this source, so it is excluded from
     * progress arithmetic and no percentage can imply a passed FAT.
     *
     * `partial` uniformly, including "Not Ready" and the rework branch. If the
     * derivation varied by branch, stage 4 would enter and leave the progress basis
     * as an item advanced — the denominator would change mid-journey and a
     * percentage could fall while work actually moved forward.
     */
    const note = 'FAT outcome needs Stock Entry "Transfer To Finished Goods", absent from this source'
    const status: Maybe<MilestoneStatus> = reworkInProgress
      ? known('rework_in_progress')
      : manufacturingDone
        ? known('fat_invitation')
        : known('not_ready')

    return milestone(4, {
      status,
      derivation: 'partial',
      plannedEnd,
      actualEnd: notInSource(note),
      provenance: {
        status: reworkInProgress
          ? 'linked rework work order is not complete'
          : manufacturingDone
            ? 'work_order.status=Completed (PDF §4 FAT invitation trigger)'
            : 'PDF §4 default — manufacturing not complete',
      },
    })
  }

  if (reworkInProgress) {
    return milestone(4, {
      status: known('rework_in_progress'),
      derivation: 'evidence',
      plannedEnd,
      actualEnd: pending('final quality adjustments in progress'),
      provenance: { status: 'linked rework work order is not complete' },
    })
  }

  // ERPNext path (M6): Stock Entry evidence is available.
  const fgTransfer = prod.rework?.completedOn ?? notInSource()
  if (isKnown(fgTransfer)) {
    return milestone(4, {
      status: known(prod.rework ? 'rework_done' : 'fat_success'),
      derivation: 'evidence',
      plannedEnd,
      actualEnd: fgTransfer,
      isComplete: true,
      provenance: { status: 'stock_entry type=Transfer To Finished Goods', actualEnd: 'stock_entry.posting_date' },
    })
  }
  return manufacturingDone
    ? milestone(4, { status: known('fat_invitation'), derivation: 'evidence', plannedEnd, provenance: { status: 'work_order.status=Completed' } })
    : milestone(4, { status: known('not_ready'), derivation: 'default', plannedEnd, provenance: { status: 'PDF §4 default' } })
}

/* ──────────── Stage 5 — Pre-Delivery Payment (PDF §4.5) ────────────────
 *
 *   Not Ready              default
 *   Delivery Payment Due   Work Order status = "Completed"
 *   Paid                   Payment Entry payment_type "Receive", allocated to
 *                          this order   date: posting_date
 *
 * Note on the temporary source: "Delivery Payment Due" *is* derivable from work
 * order status alone. It is deliberately not shown, because with no Payment
 * Entry data the stage could never reach "Paid" — so a customer who has already
 * paid would see a permanent "payment due". An unavailable stage is honest; a
 * one-way stage is not.
 */
export function deriveStage5(input: StageInput): Milestone {
  const { line, capabilities } = input
  if (capabilities.finance === false || !capabilities.finance.payments) {
    return unavailableStage(
      5,
      'source has no Payment Entry data, so a paid delivery payment cannot be observed',
    )
  }
  if (line.production === null) return noProductionStage(5)

  const wo = line.production.main
  const plannedEnd = capabilities.plannedDates.delivery ? wo.plannedDeliveryOn : notInSource()
  const manufacturingDone = isKnown(wo.status) && wo.status.value === 'completed'

  // Payment allocation itself arrives with the ERPNext provider (M6); until then
  // this branch is unreachable because the capability gate above returns first.
  return manufacturingDone
    ? milestone(5, { status: known('delivery_payment_due'), derivation: 'evidence', plannedEnd, provenance: { status: 'work_order.status=Completed' } })
    : milestone(5, { status: known('not_ready'), derivation: 'default', plannedEnd, provenance: { status: 'PDF §4 default' } })
}

/* ─────────────── Stage 6 — Delivery Readiness (PDF §4.6) ───────────────
 *
 *   Not Ready   default
 *   Ready       Stock Entry "Transfer To Finished Goods" submitted  posting_date
 *   Delivered   Delivery Note submitted for this SO item           posting_date
 */
export function deriveStage6(input: StageInput): Milestone {
  const { line, capabilities } = input
  if (!capabilities.deliveryEvents) {
    return unavailableStage(
      6,
      'source has no Stock Entry or Delivery Note data. Delivered quantity in an ' +
        'open-backlog export is 0 by construction and must not be read as "not delivered"',
    )
  }
  if (line.production === null) return noProductionStage(6)

  const wo = line.production.main
  const plannedEnd = capabilities.plannedDates.delivery ? wo.plannedDeliveryOn : notInSource()
  const delivered = isKnown(line.quantity.delivered) && line.quantity.delivered.value > 0

  if (delivered) {
    return milestone(6, {
      status: known('delivered'),
      derivation: 'evidence',
      plannedEnd,
      isComplete: true,
      provenance: { status: 'delivery_note submitted for this sales order item' },
    })
  }
  return milestone(6, { status: known('not_ready'), derivation: 'default', plannedEnd, provenance: { status: 'PDF §4 default' } })
}

/* ───────────── Stage 7 — Financial Clearance (PDF §4.7) ────────────────
 *
 *   Waiting for Invoice   default
 *   Invoice Submitted     Sales Invoice docstatus = 1   posting_date; due_date
 *   Not Paid              outstanding_amount > 0        due_date
 *   Paid                  outstanding_amount = 0
 */
export function deriveStage7(input: StageInput): Milestone {
  const { capabilities } = input
  if (capabilities.finance === false || !capabilities.finance.invoices) {
    return unavailableStage(
      7,
      'source has no Sales Invoice data, so invoiced and paid state cannot be observed',
    )
  }
  // Invoice-driven derivation arrives with the ERPNext provider (M6). Until the
  // capability is true this stage is never derived, so no customer is shown an
  // unpaid state we cannot substantiate.
  return milestone(7, {
    status: known('waiting_for_invoice'),
    derivation: 'default',
    provenance: { status: 'PDF §4 default — no submitted sales invoice' },
  })
}

export const STAGE_RULES = {
  1: deriveStage1,
  2: deriveStage2,
  3: deriveStage3,
  4: deriveStage4,
  5: deriveStage5,
  6: deriveStage6,
  7: deriveStage7,
} as const satisfies Record<StageId, (input: StageInput) => Milestone>
