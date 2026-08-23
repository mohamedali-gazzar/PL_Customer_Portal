/**
 * The stages, and the steps inside them. PM_Stages_Steps_v8.
 *
 * v8 models the order as eleven stages, 0 to 10 with no gap, each owned by one
 * team and made of one or more steps. A step has a start field and an end field,
 * and its state is read off those two dates:
 *
 *     end filled                → completed
 *     start filled, end empty   → in progress
 *     both empty                → not started
 *
 * That per-step rule is the substance of v8, not a detail of it. The previous
 * model asked the ladder — "which stage is this item on?" — and derived every card
 * from the answer, which can only ever produce one active card. v8 requires two:
 * Material Readiness and Manufacturing overlap, because production routinely
 * starts on partially available material while procurement keeps buying. See
 * `PARALLEL_PAIR`.
 *
 * ── The report has not been renumbered yet ─────────────────────────────────────
 *
 * v8 removes Financial Check and makes Delivery stage 10. The SQL feeding this
 * portal still emits the old ladder: `10 · Financial Check` (119 open lines) and
 * `11 · Delivery Readiness` (14). Renumbering the portal without renumbering the
 * report would read those 119 lines — a fifth of the open book — as "Delivery",
 * telling customers their panels are shipping when they are parked before
 * dispatch. `v8StageOf` translates instead, and becomes the identity function on
 * the day the report is rebuilt.
 *
 * ── What v8 deliberately drops ─────────────────────────────────────────────────
 *
 * No Financial Check stage. No idle or waiting rows. No invoice or payment
 * columns — v8: "those must be stripped SERVER-SIDE before anything reaches the
 * browser", which `scope.ts` does.
 *
 * Old step 11, "Delivery Note issued — pending accounts", is gone as internal.
 * That is why the step numbers run 0–10 then jump to 12; v8 offers to renumber and
 * has not been told to. The numbers here are v8's, unchanged.
 *
 * FAT is one step. v8: "FAT invitation date does not exist yet — use FAT success
 * for both until it is built." The previous model drew two steps against one date,
 * which is not evidence of two events.
 */

/** Report stage numbers, used as the badge on each card. */
export const STAGE_ORDER_CREATION = 0
/**
 * Drawings Approval. v8 marks this the only step where the customer is the
 * blocker — "the clock is on the customer side" — which is what makes it worth
 * counting on the dashboard and naming on the bar.
 */
export const AWAITING_APPROVAL_STAGE = 2
export const STAGE_MATERIAL_READINESS = 5
export const STAGE_MANUFACTURING = 6
export const STAGE_MODIFICATION = 9
export const STAGE_DELIVERY = 10

/**
 * The two stages v8 allows to run at once.
 *
 * v8, PARALLEL RULE: "Card 6 stays In Progress until main_available_on fills.
 * Card 7 goes In Progress the moment main_production_started fills. BOTH can read
 * In Progress at the same time — that is correct, not a bug."
 *
 * Named rather than inlined so the UI can say *why* two cards are lit, instead of
 * leaving a customer to wonder which one is wrong.
 */
export const PARALLEL_PAIR: readonly [number, number] = [
  STAGE_MATERIAL_READINESS,
  STAGE_MANUFACTURING,
]

/* ── the old ladder, still coming out of the report ────────────────────────── */
const REPORT_FINANCIAL_CHECK = 10
const REPORT_DELIVERY_READINESS = 11

/**
 * Translate the report's stage number into v8's.
 *
 * The two ladders agree from 0 to 9. Above that the report carries a Financial
 * Check stage that v8 removed, and pushes Delivery to 11. Both of its top two
 * stages mean the same thing to a customer — the panel is built and waiting to go
 * out — so both land on v8's Delivery.
 *
 * When the SQL is rebuilt to v8 this returns its argument unchanged, and the two
 * constants above can be deleted.
 */
export function v8StageOf(reportStage: number): number {
  if (reportStage === REPORT_FINANCIAL_CHECK) return STAGE_DELIVERY
  if (reportStage === REPORT_DELIVERY_READINESS) return STAGE_DELIVERY
  return reportStage
}

/** Kept as the old name so call sites reading "which card do I highlight" still do. */
export const visibleStageOf = v8StageOf

export interface StepSpec {
  /** v8's step number. Shown in the badge. */
  readonly no: number
  /** v8's internal step name — never rendered, kept so the row is traceable. */
  readonly internal: string
  /** v8's Customer-facing Label. English, and the fallback if a key is missing. */
  readonly label: string
  /**
   * Translation key. Stable, derived from the v8 step number rather than from the
   * report's own text — that text is internal vocabulary and changes without
   * notice, and translating it directly would put ERP wording in front of an
   * Arabic reader the first time it did.
   */
  readonly labelKey: string
  /**
   * Where this step's two dates live in `PortalItem.sd`.
   *
   * Two slots, not one. The previous model stored a single date per step and could
   * therefore only ask "has this happened yet"; v8's card state needs to
   * distinguish started-and-running from finished, which takes both ends.
   */
  readonly startAt: number
  readonly endAt: number
}

export interface StageSpec {
  readonly no: number
  readonly name: string
  readonly nameKey: string
  readonly team: string
  readonly teamKey: string
  readonly steps: readonly StepSpec[]
  /** v8: "OPTIONAL STAGE — only render the card when Rework WOs > 0." */
  readonly conditional?: boolean
}

/*
 * The date slots, in the order `deriveItem` fills them.
 *
 * Indices are the contract between derivation and the cards. They are listed as
 * named constants because a step now claims two of them and an off-by-one would
 * silently swap a start for an end.
 */
export const SLOT = {
  soCreated: 0,
  soSubmitted: 1,
  rfdCreated: 2,
  rfdSubmitted: 3,
  relCreated: 4,
  relSubmitted: 5,
  woSubmitted: 6,
  materialChecked: 7,
  materialAvailable: 8,
  productionStarted: 9,
  productionClosed: 10,
  testingStarted: 11,
  testingDone: 12,
  fatSuccess: 13,
  reworkCreated: 14,
  reworkDone: 15,
  dnCreated: 16,
  delivered: 17,
} as const

export const STAGES: readonly StageSpec[] = [
  {
    no: 0,
    name: 'Order Creation',
    nameKey: 'stage.0',
    team: 'Sales Team',
    teamKey: 'team.sales',
    steps: [
      {
        no: 0,
        internal: 'Sales order activation',
        label: 'Order Activation',
        labelKey: 'step.0',
        startAt: SLOT.soCreated,
        endAt: SLOT.soSubmitted,
      },
    ],
  },
  {
    no: 1,
    name: 'Drawing Creation',
    nameKey: 'stage.1',
    team: 'Design',
    teamKey: 'team.design',
    steps: [
      {
        no: 1,
        internal: 'RFD creation',
        label: 'Drawing preparation',
        labelKey: 'step.1',
        startAt: SLOT.rfdCreated,
        endAt: SLOT.rfdSubmitted,
      },
    ],
  },
  {
    no: 2,
    name: 'Drawings Approval',
    nameKey: 'stage.2',
    team: 'Customer',
    teamKey: 'team.customer',
    steps: [
      {
        no: 2,
        internal: 'Waiting for customer approval',
        label: 'Customer Approval',
        labelKey: 'step.2',
        startAt: SLOT.rfdSubmitted,
        endAt: SLOT.relCreated,
      },
    ],
  },
  {
    no: 3,
    name: 'Design Verification',
    nameKey: 'stage.3',
    team: 'Design',
    teamKey: 'team.design',
    steps: [
      {
        no: 3,
        internal: 'Design Verification',
        label: 'Design Verified',
        labelKey: 'step.3',
        startAt: SLOT.relCreated,
        endAt: SLOT.relSubmitted,
      },
      {
        no: 4,
        internal: 'Work Order Release',
        label: 'Work Order Release',
        labelKey: 'step.4',
        startAt: SLOT.relSubmitted,
        endAt: SLOT.woSubmitted,
      },
    ],
  },
  {
    no: 4,
    name: 'Material Planning',
    nameKey: 'stage.4',
    team: 'Planning',
    teamKey: 'team.planning',
    steps: [
      {
        no: 5,
        internal: 'Material Checked',
        label: 'Material Checked',
        labelKey: 'step.5',
        startAt: SLOT.woSubmitted,
        endAt: SLOT.materialChecked,
      },
    ],
  },
  {
    no: 5,
    name: 'Material Readiness',
    nameKey: 'stage.5',
    team: 'Procurement',
    teamKey: 'team.procurement',
    steps: [
      {
        // v8 reverted this in v8: the step ends when Material Status reads
        // Available, not at the first transfer to the floor. That revert is
        // precisely what makes it overlap with Manufacturing.
        no: 6,
        internal: 'Material Purchasing',
        label: 'Material Readiness',
        labelKey: 'step.6',
        startAt: SLOT.materialChecked,
        endAt: SLOT.materialAvailable,
      },
    ],
  },
  {
    no: 6,
    name: 'Manufacturing',
    nameKey: 'stage.6',
    team: 'Production',
    teamKey: 'team.production',
    steps: [
      {
        no: 7,
        internal: 'Production',
        label: 'Manufacturing',
        labelKey: 'step.7',
        startAt: SLOT.productionStarted,
        endAt: SLOT.productionClosed,
      },
    ],
  },
  {
    no: 7,
    name: 'Quality',
    nameKey: 'stage.7',
    team: 'Quality',
    teamKey: 'team.quality',
    steps: [
      {
        no: 8,
        internal: 'Quality Check',
        label: 'Quality check',
        labelKey: 'step.8',
        startAt: SLOT.testingStarted,
        endAt: SLOT.testingDone,
      },
    ],
  },
  {
    no: 8,
    name: 'FAT',
    nameKey: 'stage.8',
    team: 'Project Management',
    teamKey: 'team.pm',
    steps: [
      {
        // One step, not two. v8: the invitation date does not exist yet.
        no: 9,
        internal: 'FAT',
        label: 'FAT',
        labelKey: 'step.9',
        startAt: SLOT.testingDone,
        endAt: SLOT.fatSuccess,
      },
    ],
  },
  {
    // v8: "Never use the word 'rework' on screen, in English or Arabic."
    no: 9,
    name: 'Item Under Modification',
    nameKey: 'stage.9',
    team: 'Project Management',
    teamKey: 'team.pm',
    conditional: true,
    steps: [
      {
        no: 10,
        internal: 'Rework',
        label: 'Item Under Modification',
        labelKey: 'step.10',
        startAt: SLOT.reworkCreated,
        endAt: SLOT.reworkDone,
      },
    ],
  },
  {
    no: 10,
    name: 'Delivery',
    nameKey: 'stage.10',
    team: 'Deliveries',
    teamKey: 'team.deliveries',
    steps: [
      {
        // v8 numbers this 12: old step 11 was removed as internal and the rest
        // were not renumbered.
        no: 12,
        internal: 'Delivered',
        label: 'Delivery',
        labelKey: 'step.12',
        startAt: SLOT.dnCreated,
        endAt: SLOT.delivered,
      },
    ],
  },
]

/** How many date slots an item carries. Every step claims a start and an end. */
export const STEP_SLOTS = Object.keys(SLOT).length

/**
 * The stages that only exist because a work order does.
 *
 * With no work order raised there are no production documents to date them from,
 * so these would render as a row of empty cards — which reads as "nothing is
 * happening" rather than "the factory has not been told yet". 188 open lines and
 * 0 delivered lines are in that position.
 *
 * They are replaced by one neutral card rather than hidden, because a customer
 * counting stages should not find some of them missing.
 */
export const PRODUCTION_STAGES: readonly number[] = [4, 5, 6, 7, 8]

/** The stages actually drawn for this item, in order. */
export function stagesFor(hasRework: boolean): readonly StageSpec[] {
  return STAGES.filter((s) => !s.conditional || hasRework)
}

/**
 * Where a report stage sits in the strip the customer sees, counting from 1.
 *
 * v8's numbers run 0–10 with no gap, but a modification is optional, so an item
 * without one has ten cards and its Delivery card is the tenth, not the eleventh.
 * One helper, used by the cards,
 * the header line and the item table alike — three places computing this
 * separately is three chances for them to disagree about the same panel.
 */
export function stagePosition(reportStage: number, hasRework: boolean): number {
  const visible = visibleStageOf(reportStage)
  const i = stagesFor(hasRework).findIndex((s) => s.no === visible)
  return i < 0 ? 1 : i + 1
}

/**
 * What each stage is worth, summing to 100, indexed by v8 stage number.
 *
 * A flat index ÷ count misrepresents the work — drawings approval is not the same
 * size as manufacturing, which is why every open item used to read 10%.
 *
 * Eleven entries now, not twelve. Financial Check carried 5 and no longer exists;
 * its weight goes to Delivery, which is where its items were already being shown
 * and is the work they are actually waiting on.
 *
 * Stage 9 carries zero. A modification is a loop, not forward progress, so an item
 * in one holds the figure it had rather than moving backwards — which falls out of
 * a zero weight without needing a special case.
 */
export const STAGE_WEIGHTS: readonly number[] = [5, 10, 10, 5, 5, 15, 25, 10, 5, 0, 10]

export function weightedProgress(reportStage: number, fullyDelivered: boolean): number {
  if (fullyDelivered) return 100
  const done = Math.max(0, Math.min(STAGE_WEIGHTS.length, v8StageOf(reportStage)))
  let total = 0
  for (let i = 0; i < done; i += 1) total += STAGE_WEIGHTS[i] ?? 0
  return total
}

/**
 * The report's step strings, mapped to the portal's vocabulary.
 *
 * Two of these are not cosmetic. "Delivery Note Issued - Pending Accounts" exposes
 * an internal accounts workflow. "Item Under Modification" is the safe wording for
 * rework, and the underlying reason is never read at all.
 *
 * An unrecognised step falls through to the report's own text rather than being
 * dropped: a step newly appearing in the export should be visible and reported.
 */
const STEP_WORDING: Readonly<Record<string, string>> = {
  'order activation': 'Order confirmed',
  'sales order activation': 'Order confirmed',
  'sales order submitted': 'Order confirmed',
  'sent for approval': 'Sent to you for approval',
  'drawings approved': 'Approved by you',
  'design verified': 'Design verified',
  'design verification': 'Design verified',
  'drawing preparation': 'Drawings being prepared',
  'rfd creation': 'Drawings being prepared',
  'customer approval': 'Sent to you for approval',
  'waiting for customer approval': 'Sent to you for approval',
  'work order released': 'Released to production',
  'work order release': 'Released to production',
  'material checked': 'Material checked',
  'material fully available': 'Material fully available',
  'material readiness': 'Material ready',
  'material purchasing': 'Material being sourced',
  'production in-progress': 'In production',
  'production completed': 'Production complete',
  'quality check in progress': 'Quality check in progress',
  'fat success': 'FAT passed',
  fat: 'FAT passed',
  'quality check': 'Quality check in progress',
  'item under modification': 'Item under modification',
  // v8 names the internal step 'Rework'. It must never reach a screen.
  rework: 'Item under modification',
  // v8 removed this step as internal; the report still emits it for 119 lines.
  'delivery note issued - pending accounts': 'Preparing for dispatch',
  'ready for delivery': 'Ready for delivery',
  delivered: 'Delivered',
  delivery: 'Delivered',
}

/**
 * `Step Code` → the portal's translation key for that step.
 *
 * The report's own step text is internal vocabulary and changes without notice;
 * the code is stable and distinguishes the two steps the text cannot (9 is
 * Production In-progress, 90 is a modification). Anything not listed falls back
 * to the text so a new code is visible rather than blank.
 */
export const STEP_BY_CODE: Readonly<Record<number, string>> = {
  2: 'step.0',   // Sales Order Submitted   → Order Activation
  3: 'step.2',   // Sent for Approval       → the drawings are with the customer
  4: 'step.2',   // Drawings Approved
  5: 'step.3',   // Design Verified
  6: 'step.4',   // Work Order Released
  7: 'step.5',   // Material Checked
  8: 'step.6',   // Material Fully Available
  9: 'step.7',   // Production In-progress
  10: 'step.7',  // Production Completed
  11: 'step.8',  // Quality Check in Progress
  13: 'step.9',  // FAT Success
  14: 'step.12', // Delivery Note issued — v8 removed the wording, not the code
  16: 'step.12', // Ready for Delivery
  17: 'step.12', // Delivered
  90: 'step.10', // Item Under Modification
}

export function stepWording(reportStep: string | null): string | null {
  if (!reportStep) return null
  return STEP_WORDING[reportStep.trim().toLowerCase()] ?? reportStep.trim()
}

export const KNOWN_REPORT_STEPS: readonly string[] = Object.keys(STEP_WORDING)

export type LevelState = 'done' | 'active' | 'pending'

/** The two dates a card is read from, resolved for one item. */
export interface StageDates {
  readonly start: string | null
  readonly end: string | null
}

/**
 * When a stage started and finished, from its own steps' fields.
 *
 * A stage spans its steps: it starts when its first step starts and ends when its
 * last step ends. Design Verification is the only two-step stage, and that is
 * exactly how it behaves — it opens when the Released RFD is drafted and closes
 * when the Work Order is submitted.
 */
export function stageDates(spec: StageSpec, sd: readonly (string | null)[]): StageDates {
  const starts = spec.steps.map((x) => sd[x.startAt] ?? null).filter((d): d is string => !!d)
  const last = spec.steps[spec.steps.length - 1]
  return {
    start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    end: last ? (sd[last.endAt] ?? null) : null,
  }
}

/**
 * Where a stage stands. This is v8's central rule.
 *
 *     end filled                → done
 *     start filled, end empty   → active
 *     both empty                → pending
 *
 * Read per card, from that card's own two fields. That is what lets Material
 * Readiness and Manufacturing both report active — v8's PARALLEL RULE — which a
 * ladder position structurally cannot express, because a ladder has one rung.
 *
 * ── Why the ladder still has the last word behind the leading edge ────────────
 *
 * Applied without qualification the date rule is wrong on most of the real book,
 * in two different ways.
 *
 * A stage with no stamps at all would read "not started". v8's own BLOCKER says
 * the ten Work Order date fields were backfilled once and nothing keeps them
 * updated; measured over the whole export, 797 of 1303 lines have manufacturing
 * progress with no material stamp, 795 of them finished. Those cards would claim
 * nothing had happened directly above a completed one.
 *
 * A stage with a start and no end would read "still running" forever. An item at
 * Manufacturing whose Released-RFD date was never stamped would show Drawings
 * Approval open — and the bar below would draw two live segments, inventing a
 * duration for a stage that closed months ago.
 *
 * So: past the leading edge the ladder decides, and the one exception is the pair
 * v8 actually names. Material Readiness may still be running while the ladder has
 * moved to Manufacturing, because that is the real overlap v8 exists to describe.
 * Every other stage the item has demonstrably left is done, stamped or not.
 */
/**
 * Where a stage stands, decided by the report's `current_stage_#`.
 *
 *     before it  → Completed
 *     equal to it → In Progress
 *     after it   → Not started
 *
 * The report is the only current-stage engine. Dates are supporting evidence for
 * display — a completion date to print when one exists — and never move a card
 * between states.
 *
 * ── Why dates cannot decide this ──────────────────────────────────────────────
 *
 * The export's ten Work Order date fields were backfilled once and nothing keeps
 * them current, and documents get stamped out of order besides. Deriving state
 * from them put a Not-started stage above a Completed one on 869 of 1303 real
 * lines and left 788 delivered panels not reading Completed throughout. A missing
 * historical timestamp is a gap in the record, not evidence that the panel never
 * passed the stage; a timestamp on a stage the report has not reached is a
 * document touched early, not an arrival.
 *
 * ── The one exception ─────────────────────────────────────────────────────────
 *
 * v8's PARALLEL RULE, and only that: Material Readiness may still be running once
 * the report has moved to Manufacturing, because production starts on partially
 * available material while procurement keeps buying. It needs the stage's own
 * start recorded and its end still open — otherwise it is finished like anything
 * else behind the frontier. No other concurrency is invented here.
 */
export function stageState(
  stageNo: number,
  reportStage: number,
  fullyDelivered: boolean,
  dates?: StageDates,
): LevelState {
  /* Every unit shipped, so nothing is still running. Read from `Delivered Qty`
     against `SO Qty` — report fields, the same pair that decides the delivery
     label — and not from any date. It also covers the Delivered export, which
     carries no `current_stage_#` at all. */
  if (fullyDelivered) return 'done'

  const current = v8StageOf(reportStage)
  const [trailing, leading] = PARALLEL_PAIR

  if (stageNo === current) return 'active'

  if (stageNo < current) {
    const stillBuying =
      stageNo === trailing && current === leading && !!dates?.start && !dates?.end
    return stillBuying ? 'active' : 'done'
  }

  return 'pending'
}

/**
 * The v8 step the report's `step_code` names.
 *
 * `step_code` is the stable key, not the displayed text: code 9 is Production
 * In-progress and code 90 is a modification, and the two are indistinguishable by
 * their wording. Codes that mark the *end* of a step point at that same step —
 * "Production Completed" is still step 7, finished.
 */
export const STEP_NO_BY_CODE: Readonly<Record<number, number>> = {
  2: 0, // Sales Order Submitted
  3: 2, // Sent for Approval — with the customer
  4: 2, // Drawings Approved
  5: 3, // Design Verified
  6: 4, // Work Order Released
  7: 5, // Material Checked
  8: 6, // Material Fully Available
  9: 7, // Production In-progress
  10: 7, // Production Completed
  11: 8, // Quality Check in Progress
  13: 9, // FAT Success
  14: 12, // Delivery Note issued — v8 dropped the wording, not the code
  16: 12, // Ready for Delivery
  17: 12, // Delivered
  90: 10, // Item Under Modification
}

/**
 * Where a step stands inside its stage.
 *
 * The stage decides first: every step of a finished stage is finished, and none
 * of a stage not yet reached has begun. Inside the running stage the report's
 * `step_code` is the frontier, so a two-step stage can show its first step closed
 * and its second running — and never the reverse, whatever the stamps say.
 */
/** The first step of each stage, so the no-code fallback knows which one it is. */
const SPEC_FIRST_STEP = new Map<number, LevelState>(
  STAGES.flatMap((sp) => sp.steps.map((x, i) => [x.no, i === 0 ? 'active' : 'pending'] as const)),
)

export function stepState(
  stepNo: number,
  stageState: LevelState,
  stepCode: number | null,
): LevelState {
  if (stageState === 'done') return 'done'
  if (stageState === 'pending') return 'pending'

  /* No code, or one this model does not know: the stage has been reached, so its
     first step has begun and the rest have not. Conservative on purpose — without
     the code the portal cannot tell which step is running, and guessing from the
     dates is the thing this function exists to avoid. A code it does not
     recognise stays visible through the label, which falls back to the report's
     own text rather than blanking. */
  const current = stepCode === null ? undefined : STEP_NO_BY_CODE[stepCode]
  if (current === undefined) {
    const first = SPEC_FIRST_STEP.get(stepNo)
    return first ?? 'pending'
  }
  if (stepNo < current) return 'done'
  if (stepNo === current) return 'active'
  return 'pending'
}

/**
 * True when this item is in the state v8 warns about: two cards legitimately
 * lit at once.
 *
 * Surfaced so the UI can explain it. Two active cards with no explanation reads
 * as a bug to the person looking at it, and the whole point of v8's rule is that
 * it is not one.
 */
export function isParallel(states: ReadonlyMap<number, LevelState>): boolean {
  const [a, b] = PARALLEL_PAIR
  return states.get(a) === 'active' && states.get(b) === 'active'
}
