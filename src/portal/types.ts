/**
 * The portal read model.
 *
 * One shape, produced by every data provider, consumed by every screen. The
 * Excel provider derives it from the PM Phase Cycle Times export today; the
 * ERPNext provider will derive the same shape from live documents. Nothing
 * downstream of this file knows which one it is talking to.
 *
 * The derivation rules are in `derive.ts` and are verified against the approved
 * HTML prototype's own dataset, row for row — see `tests/portal/derivation.test.ts`.
 */

/** Stage state. Ordinal: a higher number is never "less done" than a lower one. */
export const STATE = {
  /** Not started. */
  none: 0,
  /** Under way right now. */
  active: 1,
  /** Finished. */
  done: 2,
  /** Cannot be computed — the source has no document for it. Never "not done". */
  gap: 3,
} as const

export type StageState = (typeof STATE)[keyof typeof STATE]

/**
 * One of the seven milestones, as a fixed tuple.
 *
 *   [state, customer-facing status, actual start, actual end, planned-by date]
 *
 * Dates are plain ISO `YYYY-MM-DD` calendar days, never timestamps: every date in
 * the source is a calendar day, and giving it a time would invent a timezone.
 */
export type Stage = readonly [
  state: StageState,
  status: string,
  start: string | null,
  end: string | null,
  planned: string | null,
]

/** One sales-order line — one panel type on one order. The unit of tracking. */
export interface PortalItem {
  readonly id: number
  readonly so: string
  readonly proj: string
  readonly cust: string
  readonly pm: string | null
  readonly grp: string | null
  readonly code: string
  readonly name: string | null

  readonly hold: number
  readonly qty: number
  readonly deliv: number
  readonly remain: number

  /** Unit rate, derived as backlog ÷ remaining qty. */
  readonly rate: number
  readonly contract: number
  readonly backlog: number
  readonly dvalue: number

  readonly soDate: string | null
  readonly cDate: string | null
  readonly cPeriod: number | null

  readonly wo?: string
  readonly woQty?: number | null
  readonly prodQty?: number | null
  readonly woStatus?: string | null
  readonly matStatus?: string | null

  /** Number of rework work orders raised. Shown to customers only as neutral wording. */
  readonly rework: number
  readonly rwStatus?: string

  /**
   * The nine-timestamp phase chain, trailing blanks trimmed:
   *   0 sales order submitted     3 release RFD submitted   6 rework raised
   *   1 initial drawing submitted 4 material ready          7 rework material ready
   *   2 release RFD created       5 work order closed       8 rework closed
   *
   * Consecutive pairs are the T1–T8 phases, which is what the timeline draws.
   */
  readonly ch: readonly (string | null)[]

  readonly nIA: number
  readonly nRev: number
  readonly nRel: number

  /** T1–T8 durations in days, as measured by the source report. */
  readonly T: readonly (number | null)[]

  readonly age: number | null
  readonly dtc: number | null
  readonly late: number
  readonly pct: number

  /** The seven milestones, in order. */
  readonly st: readonly Stage[]

  /** First stage that is not `done` — the one the order is really waiting on. */
  readonly nextStage: string
  readonly nextStatus: string

  /* ── the report's own verdict ──────────────────────────────────────────────
     These come straight from the export's `Current *` columns. The rule that
     produces them lives in SQL and is owned by the ERP team; the portal reads it
     rather than keeping a second copy that would drift. Spec, Delta 3. */

  /** `Current Stage #`, 0–11. Portal milestone is this plus one. */
  readonly stage: number
  /** `Current Step`, already mapped to the portal's wording. */
  readonly step: string | null
  /** `Step Code`. Sort key; 90 is rework, and it sits between 13 and 14. */
  /**
   * `Step Code` — the report's stable identifier for the current step.
   *
   * Not the same as `Current Step #`: the two agree everywhere except a
   * modification, which the report numbers 9 like Production In-progress but
   * codes 90. Matching the step by its displayed text cannot tell those apart,
   * which is why the code is what the portal keys on.
   */
  readonly stepCode: number | null
  /** `Stage Since` — the "From" date on the active milestone. */
  readonly since: string | null
  /** `Days In Current Stage` — the running counter, no longer calculated here. */
  readonly dis: number | null

  /**
   * How many main work orders back this line.
   *
   * Above one, the dates are a blend of several panels and can overstate progress,
   * so the UI softens the wording. Spec §9.2.
   */
  readonly mainWos: number

  /**
   * Completion date per rendered step, in the order `STAGES` declares them.
   *
   * `null` means the report carries no date for that step. That is not "not
   * done" — the ladder decides that — it is "not recorded", and the card says so.
   */
  readonly sd: readonly (string | null)[]
}

/** One sales order, rolled up from its item lines. */
/**
 * What a customer's browser actually receives for one line.
 *
 * `PortalItem` is the internal model and carries more than any screen needs: a
 * derived unit rate, the raw rework work-order status, the nine-timestamp chain
 * and the T1–T8 durations that feed the PM console's benchmarks, and the retired
 * `nextStage` / `nextStatus` pair.
 *
 * None of it is rendered, but all of it used to be serialised — and "not rendered"
 * is not "not sent". This type is the wire contract, so anything absent here cannot
 * reach the browser however the UI is later changed. Removing a field from it makes
 * every consumer a compile error rather than a silent blank.
 */
export type CustomerItem = Omit<
  PortalItem,
  | 'rate'
  | 'rwStatus'
  | 'nextStage'
  | 'nextStatus'
  | 'ch'
  | 'T'
  | 'woQty'
  | 'prodQty'
  | 'nIA'
  | 'nRel'
  | 'age'
  | 'remain'
>

/** The fields dropped on the way out, named once so the test can assert on them. */
export const CUSTOMER_ITEM_OMITTED = [
  'rate', 'rwStatus', 'nextStage', 'nextStatus', 'ch', 'T',
  'woQty', 'prodQty', 'nIA', 'nRel', 'age', 'remain',
] as const

export interface PortalOrder {
  readonly so: string
  readonly proj: string
  readonly cust: string
  readonly pm: string | null
  readonly soDate: string | null
  /** Earliest contractual date across the order's lines. */
  readonly cDate: string | null
  readonly cPeriod: number | null
  readonly items: readonly number[]
  readonly contract: number
  readonly backlog: number
  readonly dvalue: number
  readonly qty: number
  readonly deliv: number
  readonly hold: number
  readonly pct: number
  readonly nItems: number
  readonly late: number
  readonly dtc: number | null
  readonly age: number | null
  /** Status of the least-advanced line — what the customer is actually waiting for. */
  readonly next: string | null
  /** 1 when a drawing is sitting with the customer for approval. */
  readonly await: number
}

/**
 * What a customer's browser receives for one order.
 *
 * The order roll-up carried two fields no screen reads. `age` is a cycle-time
 * metric for Powerline's own benchmarking. `next` is the least-advanced line's
 * status, which for an order sitting at a stage the export cannot feed spelled out
 * the ERP document behind it — the order-level twin of the wording already stripped
 * from `st[]`, and the reason a payload scan is worth running over the real data
 * rather than over the type.
 */
export type CustomerOrder = Omit<PortalOrder, 'age' | 'next'>

/** Dropped on the way out, named once so the check can assert on them. */
export const CUSTOMER_ORDER_OMITTED = ['age', 'next'] as const

/** One customer company, rolled up from its orders. */
export interface PortalCustomer {
  readonly name: string
  readonly orders: readonly string[]
  readonly contract: number
  readonly backlog: number
  readonly dvalue: number
  readonly nItems: number
  readonly late: number
  readonly await: number
  readonly nOrders: number
  readonly pct: number
}

/** Cycle-time statistics for one phase. */
export interface PhaseBenchmark {
  readonly n: string
  readonly count: number
  readonly med: number
  readonly avg: number
  readonly p90: number
  readonly max: number
}

export interface NameCount {
  readonly n: string | null
  readonly c: number
}

export interface PortalMeta {
  /** The day the source data is true as of. Every countdown is measured from here. */
  readonly exportDate: string
  readonly rows: number
  readonly orders: number
  readonly customers: number
  readonly backlog: number
  readonly contract: number
  readonly delivered: number
  readonly lateOrders: number
  readonly holdOrders: number
  readonly bench: readonly PhaseBenchmark[]
  readonly pms: readonly NameCount[]
  readonly groups: readonly NameCount[]
}

/** Everything the portal knows, before any tenant scoping is applied. */
export interface PortalSnapshot {
  readonly meta: PortalMeta
  readonly items: readonly PortalItem[]
  readonly orders: readonly PortalOrder[]
  readonly customers: readonly PortalCustomer[]
}

/**
 * The portfolio-wide metadata a customer is allowed to see: the as-of date, and
 * nothing else.
 *
 * `PortalMeta` carries the company's total backlog, its project managers and
 * their workloads, and the product mix across every customer. None of that is any
 * customer's business, so the scoped payload gets its own narrower type — a
 * customer screen cannot render a field it was never handed.
 */
export interface CustomerMeta {
  readonly exportDate: string
}

/**
 * What one signed-in customer is allowed to see.
 *
 * Produced by `scope.ts` from a snapshot plus a tenant identity. Item ids are
 * renumbered from zero so the payload does not disclose how many other rows exist
 * in the source.
 */
export interface ScopedSnapshot {
  readonly meta: CustomerMeta
  readonly items: readonly CustomerItem[]
  readonly orders: readonly CustomerOrder[]
  readonly customer: PortalCustomer
}
