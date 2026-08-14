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
}

/** One sales order, rolled up from its item lines. */
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
  /**
   * Whether the names in this snapshot are real or synthetic.
   *
   * Stamped by `build:snapshot` and reported by `/api/health`, so which dataset a
   * deployment is serving is a question with an answer rather than something you
   * work out by recognising a customer. Absent means real — the safe reading, since
   * it prompts a look rather than false reassurance.
   *
   * Never reaches a customer: their payload carries `CustomerMeta`.
   */
  readonly dataset?: 'real' | 'anonymised'
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
  readonly items: readonly PortalItem[]
  readonly orders: readonly PortalOrder[]
  readonly customer: PortalCustomer
}
