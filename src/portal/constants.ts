/**
 * The vocabulary of the portal: the seven milestones, the eight measured phases,
 * and the words each one is described with.
 *
 * Both lists come from the approved brief and the operations tracking sheet.
 * They are constants, not configuration — changing one changes what a status
 * means, which is a business decision, not a deployment setting.
 */

/** The seven milestones, in order. Brief §4. */
export const STAGE_NAMES = [
  'Drawings Approval',
  'Material Readiness',
  'Manufacturing',
  'FAT / Quality',
  'Pre-Delivery Payment',
  'Delivery Readiness',
  'Financial Clearance',
] as const

/** Column headings — the same seven, short enough for a narrow card. */
export const STAGE_SHORT = [
  'Drawings',
  'Material',
  'Manufacturing',
  'FAT / Quality',
  'Payment',
  'Delivery',
  'Clearance',
] as const

/**
 * Which stages have no source document in the current export.
 *
 * These render as an explicit "awaiting feed" state rather than as "not done" —
 * the distinction between *unknown* and *incomplete* is the whole point. Both
 * flip to false the moment the ERPNext provider supplies Sales Invoice and
 * Payment Entry.
 */
export const STAGE_GAP = [false, false, false, false, true, false, true] as const

/**
 * The eight phases the business already measures (T1–T8), each one the gap
 * between two consecutive timestamps in `PortalItem.ch`.
 */
export const PHASES = [
  { t: 'T1', n: 'Preparing drawings', w: 'Our engineers draw the panel and send it to you for approval.' },
  { t: 'T2', n: 'With you for approval', w: 'The drawing is with you. Nothing can be built until it comes back approved.' },
  { t: 'T3', n: 'Releasing to production', w: 'Your approved drawing is released to the shop floor as a work order.' },
  { t: 'T4', n: 'Gathering material', w: 'Every component for your panel is being collected and booked to the job.' },
  { t: 'T5', n: 'Manufacturing', w: 'Your panel is assembled, wired and tested on the production line.' },
  { t: 'T6', n: 'Quality check', w: 'The panel is inspected and any final adjustments are raised.' },
  { t: 'T7', n: 'Adjustment material', w: 'Parts for the final adjustments are being gathered.' },
  { t: 'T8', n: 'Final adjustments', w: 'The last quality adjustments are being made before sign-off.' },
] as const

/** Report names for the eight phases, as they appear in the PM cycle-times export. */
export const PHASE_REPORT_NAMES = [
  'T1 Drawings Submission',
  'T2 Customer Approval',
  'T3 WO Release',
  'T4 Material',
  'T5 Manufacturing',
  'T6 Rework Release',
  'T7 Rework Material',
  'T8 Rework Manufacturing',
] as const

/**
 * The seven-step stage ramp: one hue, monotonically *brightening*.
 *
 * Ordinal data gets an ordinal scale — lightness alone carries the order, so it
 * survives greyscale printing and the common colour-vision deficiencies.
 *
 * The direction is reversed from the light-mode original. On white, darkening as
 * the sequence advances is correct; against this interface's near-black ground
 * those late steps measured under 2:1 and simply disappeared. Brightening also
 * happens to read as advancement, which the earlier ramp had to fight.
 */
export const STAGE_HEX = ['#A85B2E', '#BC682F', '#D07734', '#E08A45', '#E9A162', '#F0B884', '#F5CDA8'] as const

/** The eight-step phase ramp used by the timeline ribbon. Same reversal. */
export const PHASE_HEX = [
  '#9C5228', '#AE5C2B', '#C0672F', '#D07434', '#DE8543', '#E89C60', '#F0B183', '#F5C6A3',
] as const

/** Customer-facing status wording. Kept in one place so tone stays consistent. */
export const STATUS = {
  underPreparation: 'Under preparation',
  sentForApproval: 'Sent for approval',
  approved: 'Approved',

  notStarted: 'Not started',
  materialNotAvailable: 'Material not available',
  partiallyAvailable: 'Partially available',
  fullyAvailable: 'Fully available',

  notReleased: 'Not released',
  inProgress: 'In progress',
  completed: 'Completed',

  notReady: 'Not ready',
  readyForFat: 'Ready for FAT',
  /** Deliberately neutral: the customer never sees an internal rework reason. */
  reworkInProgress: 'Final quality adjustments in progress',
  reworkComplete: 'Final quality adjustments complete',

  readyForDelivery: 'Ready for delivery',
  notDelivered: 'Not delivered',
  partiallyDelivered: 'Partially delivered',
  delivered: 'Delivered',

  awaitingPaymentFeed: 'Awaiting Payment Entry feed',
  awaitingInvoiceFeed: 'Awaiting Sales Invoice feed',
} as const
