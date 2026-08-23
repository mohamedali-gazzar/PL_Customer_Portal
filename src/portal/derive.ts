/**
 * Raw export rows → the portal read model.
 *
 * This is the business logic of the whole portal: every status a customer sees is
 * computed here, from documents the factory already produces. Nothing is typed by
 * hand and nothing is stored — change the rule, and every screen changes with it.
 *
 * Correctness is not argued, it is demonstrated: `tests/portal/derivation.test.ts`
 * runs the real export through this module and asserts the result equals the
 * approved prototype's dataset field for field, across all 480 lines, 152 orders
 * and 107 customers. Any change that alters a single status fails that test.
 */

import type { RawBacklogRow } from '@/providers/excel/parse'
import { STAGE_DELIVERY, stepWording, weightedProgress } from './milestones'
import { isDnApproved } from '@/providers/excel/columns'
import { PHASE_REPORT_NAMES, STAGE_NAMES, STATUS } from './constants'
import type {
  NameCount,
  PhaseBenchmark,
  PortalCustomer,
  PortalItem,
  PortalMeta,
  PortalOrder,
  PortalSnapshot,
  Stage,
  StageState,
} from './types'
import { STATE } from './types'

/* ------------------------------------------------------------------ cells -- */

type Cell = string | number | Date | null

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A cell as a plain ISO calendar day.
 *
 * exceljs materialises date cells as `Date` at UTC midnight, so the UTC parts are
 * the day the spreadsheet shows. Reading local parts instead would shift every
 * date by one for anyone west of Greenwich — including Cairo on a DST boundary.
 */
export function isoDate(v: Cell): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  }
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim())
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : isoDate(d)
  }
  // An Excel serial number, if the sheet stored the day unformatted.
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400000)
    return isoDate(new Date(ms))
  }
  return null
}

function num(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

const num0 = (v: Cell): number => num(v) ?? 0

function text(v: Cell): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isoDate(v)
  const s = String(v).trim()
  return s === '' ? null : s
}

/* ------------------------------------------------------------------- days -- */

const DAY = 86_400_000
const asUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Whole calendar days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((asUtc(b) - asUtc(a)) / DAY)
}

export function addDays(iso: string, n: number): string {
  return isoDate(new Date(asUtc(iso) + n * DAY))!
}

/** Earliest of the supplied days, ignoring blanks. ISO strings sort as dates do. */
function earliest(...xs: (string | null)[]): string | null {
  let best: string | null = null
  for (const x of xs) if (x && (best === null || x < best)) best = x
  return best
}

/**
 * Round half to even.
 *
 * Used for every percentage so that a value landing exactly on .5 resolves the
 * same way every time, on every platform, rather than drifting with the engine's
 * choice. Matches the arithmetic the approved dataset was produced with.
 */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x)
  const diff = x - f
  if (diff > 0.5) return f + 1
  if (diff < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

/**
 * The T1–T8 durations implied by a timestamp chain.
 *
 * Each phase is the gap between two consecutive timestamps; a phase whose either
 * end is missing is unmeasured, not zero. Verified against the export's own T
 * columns on all 480 lines — they agree exactly, which is what licenses the
 * ERPNext provider to compute these rather than read them from a report.
 */
export function phaseDurations(chain: readonly (string | null)[]): (number | null)[] {
  return Array.from({ length: 8 }, (_, k) => daysBetween(chain[k] ?? null, chain[k + 1] ?? null))
}

/* ------------------------------------------------------------ work orders -- */

type WoProgress = 'done' | 'active' | 'notstarted' | null

/**
 * One line can carry several work orders, whose statuses arrive joined as text
 * ("Completed, Not Started"). The most advanced one wins: the line has demonstrably
 * reached that point, and reporting the least advanced would hide real progress.
 *
 * `Closed` counts as complete — ERPNext closes a work order that will not be
 * worked further, and the brief's rule table predates that status.
 */
/**
 * What a delivered quantity means, in one place.
 *
 * Previously any non-zero delivered quantity read "Partially delivered", which put
 * "Partially delivered (1 of 1)" in front of 130 customers whose panels had shipped
 * in full — a label that contradicts itself.
 *
 * Over-delivery is real in this data and is reported as delivered rather than as
 * an anomaly. A customer who has received more than they ordered does not need the
 * portal to argue with them about it; the discrepancy is a matter for the invoice.
 */
export type DeliveryState = 'none' | 'partial' | 'delivered'

export function deliveryState(delivered: number, ordered: number): DeliveryState {
  if (!(delivered > 0)) return 'none'
  if (ordered > 0 && delivered >= ordered) return 'delivered'
  if (!(ordered > 0)) return 'delivered' // nothing was ordered but something shipped
  return 'partial'
}

export function workOrderProgress(raw: string | null): WoProgress {
  const parts = (raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  if (parts.some((p) => p === 'Completed' || p === 'Closed')) return 'done'
  if (parts.some((p) => p === 'In Process')) return 'active'
  return 'notstarted'
}

/** "1 of 2", "0.9 of 1" — quantities read back the way they were ordered. */
const qty = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(6))))

/* ------------------------------------------------------------------ items -- */

export function deriveItem(id: number, r: RawBacklogRow): PortalItem {
  const soQty = num0(r.soQty)
  const deliv = num0(r.deliveredQty)
  const remain = num0(r.remainingQty)
  const backlog = num0(r.backlogAmount)

  /* The export gives a line's value, not its unit price, and which value depends
     on which report the row came from. Open Backlog carries `Backlog Amount` over
     the remaining quantity; Delivered carries `Delivered Amount` over the quantity
     shipped, and no backlog column at all — a delivered line has no backlog.

     One divides into the other exactly in both cases, so the rate is recovered
     rather than assumed. Without the second branch every delivered line would
     price at zero, and contract value would silently exclude everything that has
     already shipped — the very error Delta 4 exists to fix. */
  const deliveredAmount = num0(r.deliveredAmount)
  const rate = remain
    ? backlog / remain
    : deliv && deliveredAmount
      ? deliveredAmount / deliv
      : 0

  const soDate = isoDate(r.soSubmitted)
  const cDate = isoDate(r.contractualDate)

  const iaCreated = isoDate(r.iaCreated)
  const iaSubmitted = isoDate(r.iaSubmitted)
  const revCreated = isoDate(r.revCreated)
  const revSubmitted = isoDate(r.revSubmitted)
  const relCreated = isoDate(r.relCreated)
  const relSubmitted = isoDate(r.relSubmitted)

  const mainCreated = isoDate(r.mainCreated)
  const materialReady = isoDate(r.mainMaterialReady)
  const mainClosed = isoDate(r.mainClosed)
  const reworkCreated = isoDate(r.reworkCreated)
  const reworkMaterialReady = isoDate(r.reworkMaterialReady)
  const reworkClosed = isoDate(r.reworkClosed)

  const workOrder = text(r.workOrder)
  const hasWorkOrder = num0(r.mainWoCount) > 0 || Boolean(workOrder)
  const rework = Math.trunc(num0(r.reworkWoCount))
  const reworkOpen = rework > 0 && !reworkClosed

  const nRel = Math.trunc(num0(r.releasedRfds))
  const progress = workOrderProgress(text(r.mainWoStatus))
  const materialStatus = text(r.mainMaterialStatus)

  /* -- the nine-timestamp chain. Trailing blanks are trimmed so the timeline
        never draws a tail into a phase that has not been reached. ------------ */
  const chain: (string | null)[] = [
    soDate,
    iaSubmitted, // the *initial* drawing only: a revision is not a first submission
    relCreated,
    relSubmitted,
    materialReady,
    mainClosed,
    reworkCreated,
    reworkMaterialReady,
    reworkClosed,
  ]
  while (chain.length > 0 && chain[chain.length - 1] === null) chain.pop()

  /* -- 1. Drawings approval --------------------------------------------------
        Released means approved, whether or not the release document has been
        submitted yet. The start is the earliest drawing activity of any kind, so
        a revision cycle cannot make the stage appear to start after it ended. */
  const drawStart = earliest(iaCreated, revCreated, relCreated)
  const stage1: Stage =
    nRel > 0
      ? [STATE.done, STATUS.approved, drawStart, relSubmitted, null]
      : drawStart || iaSubmitted || revSubmitted
        ? [STATE.active, STATUS.sentForApproval, drawStart, null, null]
        : [STATE.none, STATUS.underPreparation, null, null, null]

  /* -- 2. Material readiness -------------------------------------------------
        The re-planned delivery date supersedes the original when one exists. */
  const materialPlan = isoDate(r.mainModifiedMaterialDeliveryDate) ?? isoDate(r.mainMaterialDeliveryDate)
  const stage2: Stage = !hasWorkOrder
    ? [STATE.none, STATUS.notStarted, null, null, materialPlan]
    : materialStatus === 'Available'
      ? [STATE.done, STATUS.fullyAvailable, mainCreated, materialReady, materialPlan]
      : materialStatus === 'Partially Available'
        ? [STATE.active, STATUS.partiallyAvailable, mainCreated, materialReady, materialPlan]
        : [STATE.none, STATUS.materialNotAvailable, mainCreated, materialReady, materialPlan]

  /* -- 3. Manufacturing ------------------------------------------------------
        Manufacturing begins when material lands; where that timestamp is absent
        the work order's own creation is the only honest fallback. */
  const mfgStart = materialReady ?? mainCreated
  const mfgPlan = isoDate(r.mainPlannedEndDate)
  const stage3: Stage = !hasWorkOrder
    ? [STATE.none, STATUS.notReleased, null, null, mfgPlan]
    : progress === 'done'
      ? [STATE.done, STATUS.completed, mfgStart, mainClosed, mfgPlan]
      : progress === 'active'
        ? [STATE.active, STATUS.inProgress, mfgStart, null, mfgPlan]
        : [STATE.none, STATUS.notStarted, mfgStart, null, mfgPlan]

  /* -- 4. FAT / quality ------------------------------------------------------
        Rework is reported neutrally. The reason, the comment and the responsible
        party stay inside the factory — brief §4 and §7.3. */
  const reworkPlan = isoDate(r.reworkPlannedEndDate)
  const stage4: Stage =
    rework > 0
      ? reworkClosed
        ? [STATE.done, STATUS.reworkComplete, reworkCreated, reworkClosed, reworkPlan]
        : [STATE.active, STATUS.reworkInProgress, reworkCreated, null, reworkPlan]
      : progress === 'done'
        ? [STATE.active, STATUS.readyForFat, mainClosed, null, reworkPlan]
        : [STATE.none, STATUS.notReady, null, null, reworkPlan]

  /* -- 5. Pre-delivery payment ----------------------------------------------
        No Payment Entry in this source. Reported as unavailable rather than as
        "due": a customer who has already paid must never be shown a demand. */
  const stage5: Stage = [STATE.gap, STATUS.awaitingPaymentFeed, null, null, null]

  /* -- 6. Delivery readiness ------------------------------------------------- */
  const stage6: Stage = (() => {
    const state = deliveryState(deliv, soQty)
    if (state === 'delivered') {
      return [STATE.done, STATUS.delivered, null, null, cDate] as Stage
    }
    if (state === 'partial') {
      const label = `${STATUS.partiallyDelivered} (${qty(deliv)} of ${qty(soQty)})`
      return [STATE.active, label, null, null, cDate] as Stage
    }
    return progress === 'done' && !reworkOpen
      ? ([STATE.active, STATUS.readyForDelivery, null, null, cDate] as Stage)
      : ([STATE.none, STATUS.notReady, null, null, cDate] as Stage)
  })()

  /* -- 7. Financial clearance ------------------------------------------------ */
  const stage7: Stage = [STATE.gap, STATUS.awaitingInvoiceFeed, null, null, null]

  const st: Stage[] = [stage1, stage2, stage3, stage4, stage5, stage6, stage7]

  /* -- progress --------------------------------------------------------------
        Averaged over the stages that *can* be computed. An unavailable stage is
        excluded from the denominator entirely: counting it as incomplete would
        cap every panel at 71%, and letting it enter the denominator later would
        let a percentage fall while work moved forward. */
  const measurable = st.filter((s) => s[0] !== STATE.gap)
  const score = measurable.reduce(
    (a, s) => a + (s[0] === STATE.done ? 1 : s[0] === STATE.active ? 0.5 : 0),
    0,
  )
  const pct = roundHalfEven((100 * score) / measurable.length)

  const cursor = st.findIndex((s) => s[0] !== STATE.done)
  const cur = cursor < 0 ? st.length - 1 : cursor

  /* ── one date per step ────────────────────────────────────────────────────
     Each step completes when one specific column stops being empty. The order
     matches `STAGES`, which is the contract between this and the cards.

     A null is "the report carries no date", not "not done": done-ness is decided
     by the ladder. The Delivered export supplies far fewer of these columns than
     the model document claims — see docs/SPEC-AUDIT.md §3.1 — and those rows lean
     on exactly that distinction. */
  const materialChecked = earliest(
    isoDate(r.mainNotAvailableOn),
    isoDate(r.mainPartiallyAvailableOn),
    isoDate(r.mainAvailableOn),
  )
  const deliveredOn = isoDate(r.deliveredOn) ?? isoDate(r.deliveredDate)
  const dnReady = isDnApproved(text(r.dnWorkflowState)) ? isoDate(r.dnCreatedOn) : null

  /* Testing closes on whichever result landed first. v8: the step ends when
     Testing Status is set to Touchup or Completed. A rejection is deliberately not
     read here — v8: "do NOT show a rejection to the customer. It feeds stage 9." */
  const testingDone = earliest(
    isoDate(r.mainTestingTouchupOn),
    isoDate(r.mainTestingCompletedOn),
  )
  const reworkDone = earliest(
    isoDate(r.reworkTestingTouchupOn),
    isoDate(r.reworkTestingCompletedOn),
  )

  /* The start and end of every v8 step, in `SLOT` order.
     Two dates per step, because a card's state is read off both: end filled is
     done, start alone is running, neither is not started. */
  const sd: (string | null)[] = [
    isoDate(r.soCreatedOn) ?? isoDate(r.soSubmitted), //  0 SO created (draft)
    isoDate(r.soSubmitted),                           //  1 SO submitted
    // v8 step 1 starts at the IA, or the revision when there is no IA.
    isoDate(r.iaCreated) ?? isoDate(r.revCreated),    //  2 RFD created
    isoDate(r.revSubmitted) ?? isoDate(r.iaSubmitted),//  3 RFD submitted
    // v8 step 2 ends when the Released RFD is drafted; the approval date is the
    // same event seen from the customer's side and stands in when it is missing.
    isoDate(r.relCreated) ?? isoDate(r.relApproved),  //  4 Released RFD created
    isoDate(r.relSubmitted),                          //  5 Released RFD submitted
    isoDate(r.mainWoSubmittedOn),                     //  6 Work Order submitted
    materialChecked,                                  //  7 Material status first set
    // v8 reverted step 6's end to Available, with Material Ready as confirmation.
    isoDate(r.mainAvailableOn) ?? isoDate(r.mainMaterialReady), // 8 Material available
    isoDate(r.mainProductionStarted),                 //  9 Production started
    isoDate(r.mainClosed),                            // 10 Work Order closed
    isoDate(r.mainTestingStartedOn) ?? isoDate(r.mainClosed), // 11 Testing started
    testingDone,                                      // 12 Testing concluded
    isoDate(r.mainFatSuccess),                        // 13 FAT success
    isoDate(r.reworkCreated),                         // 14 Modification raised
    reworkDone ?? isoDate(r.reworkClosed),            // 15 Modification concluded
    dnReady,                                          // 16 Delivery note drafted
    deliveredOn,                                      // 17 Delivered
  ]

  /* ── the report's verdict, read rather than recomputed ─────────────────────
     `Current Stage #` is absent from the Delivered export. That is not a gap to
     guess at: a row in that file is fully delivered by the report's own filter
     (`delivered_qty >= qty`), which is v8's Delivery. */
  const fullyDelivered = deliveryState(deliv, soQty) === 'delivered'
  const reportStage = num(r.currentStageNo)
  const stage = reportStage ?? (fullyDelivered ? STAGE_DELIVERY : 0)
  const step = stepWording(text(r.currentStep)) ?? (fullyDelivered ? 'Delivered' : null)
  const pctWeighted = weightedProgress(stage, fullyDelivered)

  const dtc = num(r.daysToContractual)

  const item: PortalItem = {
    id,
    so: text(r.salesOrder) ?? '',
    proj: text(r.project) ?? '',
    cust: text(r.customer) ?? '',
    pm: text(r.projectManager),
    grp: text(r.itemGroup),
    code: text(r.item) ?? '',
    name: text(r.itemName),
    hold: Math.trunc(num0(r.onHold)),
    qty: soQty,
    deliv,
    remain,
    rate,
    contract: soQty * rate,
    backlog,
    dvalue: deliv * rate,
    soDate,
    cDate,
    cPeriod: num(r.contractualPeriodDays),
    ...(workOrder
      ? {
          wo: workOrder,
          woQty: num(r.woQty),
          prodQty: num(r.producedQty),
          woStatus: text(r.mainWoStatus),
          matStatus: materialStatus,
        }
      : {}),
    rework,
    ...(rework > 0 && text(r.reworkWoStatus) ? { rwStatus: text(r.reworkWoStatus)! } : {}),
    ch: chain,
    nIA: Math.trunc(num0(r.initialApprovalRfds)),
    nRev: Math.trunc(num0(r.revisionRfds)),
    nRel,
    T: [
      num(r.t1DrawingsSubmission),
      num(r.t2CustomerApproval),
      num(r.t3WoRelease),
      num(r.t4Material),
      num(r.t5Manufacturing),
      num(r.t6ReworkRelease),
      num(r.t7ReworkMaterial),
      num(r.t8ReworkManufacturing),
    ],
    age: num(r.ageSinceSo),
    dtc,
    late: dtc !== null && dtc < 0 ? 1 : 0,
    pct: pctWeighted,
    st,
    nextStage: STAGE_NAMES[cur]!,
    nextStatus: st[cur]![1],
    stage,
    step,
    stepCode: num(r.stepCode),
    since: isoDate(r.stageSince),
    dis: num(r.daysInCurrentStage),
    mainWos: Math.trunc(num0(r.mainWoCount)),
    sd,
  }
  return item
}

/* ----------------------------------------------------------------- orders -- */

/** The stage a line is really waiting on — the first that is not finished. */
const currentStage = (it: PortalItem): number => {
  const i = it.st.findIndex((s) => s[0] !== STATE.done)
  return i < 0 ? it.st.length - 1 : i
}

export function deriveOrders(items: readonly PortalItem[]): PortalOrder[] {
  const grouped = new Map<string, PortalItem[]>()
  for (const it of items) {
    const list = grouped.get(it.so)
    if (list) list.push(it)
    else grouped.set(it.so, [it])
  }

  const orders: PortalOrder[] = []
  for (const [so, its] of grouped) {
    const first = its[0]!
    const sum = (f: (i: PortalItem) => number) => its.reduce((a, i) => a + f(i), 0)

    const contractualDates = its.map((i) => i.cDate).filter((d): d is string => Boolean(d))
    const dtcs = its.map((i) => i.dtc).filter((d): d is number => d !== null)

    // What the customer is waiting for is set by the *least advanced* line: the
    // order is not ready until its slowest panel is.
    const pending = its.filter((i) => i.pct < 100)
    const least = pending.length
      ? pending.reduce((a, b) => (b.pct < a.pct ? b : a))
      : null

    orders.push({
      so,
      proj: first.proj,
      cust: first.cust,
      pm: first.pm,
      soDate: first.soDate,
      cDate: contractualDates.length ? contractualDates.reduce((a, b) => (b < a ? b : a)) : null,
      cPeriod: first.cPeriod,
      items: its.map((i) => i.id),
      contract: sum((i) => i.contract),
      backlog: sum((i) => i.backlog),
      dvalue: sum((i) => i.dvalue),
      qty: sum((i) => i.qty),
      deliv: sum((i) => i.deliv),
      hold: its.some((i) => i.hold) ? 1 : 0,
      pct: roundHalfEven(sum((i) => i.pct) / its.length),
      nItems: its.length,
      late: its.some((i) => i.late) ? 1 : 0,
      dtc: dtcs.length ? Math.min(...dtcs) : null,
      age: first.age,
      next: least ? least.st[currentStage(least)]![1] : null,
      await: its.some((i) => i.st[0]![0] === STATE.active) ? 1 : 0,
    })
  }

  // Largest open commitment first — the order that matters most is at the top.
  orders.sort((a, b) => b.backlog - a.backlog)
  return orders
}

/* -------------------------------------------------------------- customers -- */

export function deriveCustomers(
  orders: readonly PortalOrder[],
  firstSeen: ReadonlyMap<string, number>,
): PortalCustomer[] {
  const grouped = new Map<string, PortalOrder[]>()
  for (const o of orders) {
    const list = grouped.get(o.cust)
    if (list) list.push(o)
    else grouped.set(o.cust, [o])
  }

  const customers: PortalCustomer[] = []
  for (const [name, os] of grouped) {
    const sum = (f: (o: PortalOrder) => number) => os.reduce((a, o) => a + f(o), 0)
    customers.push({
      name,
      // Chronological, as the relationship actually unfolded.
      orders: os.map((o) => o.so).sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0)),
      contract: sum((o) => o.contract),
      backlog: sum((o) => o.backlog),
      dvalue: sum((o) => o.dvalue),
      nItems: sum((o) => o.nItems),
      late: sum((o) => o.late),
      await: sum((o) => o.await),
      nOrders: os.length,
      pct: roundHalfEven(sum((o) => o.pct) / os.length),
    })
  }

  customers.sort((a, b) => b.backlog - a.backlog)
  return customers
}

/* ------------------------------------------------------------------- meta -- */

function median(sorted: readonly number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const mid = n >> 1
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Nearest-rank percentile: the smallest observed value at or above the rank.
 *
 * Deliberately not interpolated — the p90 is quoted to the business as "nine in
 * ten finish within N days", and that sentence is only true of a value that
 * actually occurred.
 */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.max(1, Math.ceil(q * sorted.length))
  return sorted[rank - 1]!
}

function benchmarks(items: readonly PortalItem[]): PhaseBenchmark[] {
  return PHASE_REPORT_NAMES.map((n, k) => {
    const vals = items
      .map((i) => i.T[k])
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    if (vals.length === 0) return { n, count: 0, med: 0, avg: 0, p90: 0, max: 0 }
    return {
      n,
      count: vals.length,
      med: median(vals),
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      p90: percentile(vals, 0.9),
      max: vals[vals.length - 1]!,
    }
  })
}

/** Counts by a field, most common first; ties keep the order they first appeared. */
function countBy(items: readonly PortalItem[], pick: (i: PortalItem) => string | null): NameCount[] {
  const counts = new Map<string | null, number>()
  const order = new Map<string | null, number>()
  for (const it of items) {
    const k = pick(it)
    counts.set(k, (counts.get(k) ?? 0) + 1)
    if (!order.has(k)) order.set(k, order.size)
  }
  return [...counts.entries()]
    .map(([n, c]) => ({ n, c }))
    .sort((a, b) => b.c - a.c || (order.get(a.n) ?? 0) - (order.get(b.n) ?? 0))
}

/**
 * The day the export is true as of, recovered from the data itself.
 *
 * Every row carries `Age Since SO`, so every row implies the same as-of date. The
 * majority wins. The filename also carries a date, but a filename is not evidence.
 */
export function deriveExportDate(rows: readonly RawBacklogRow[], fallback: string): string {
  const votes = new Map<string, number>()
  for (const r of rows) {
    const so = isoDate(r.soSubmitted)
    const age = num(r.ageSinceSo)
    if (!so || age === null) continue
    const day = addDays(so, Math.trunc(age))
    votes.set(day, (votes.get(day) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [day, n] of votes) if (n > bestN) [best, bestN] = [day, n]
  return best ?? fallback
}

/* --------------------------------------------------------------- snapshot -- */

export function deriveSnapshot(rows: readonly RawBacklogRow[], fallbackDate: string): PortalSnapshot {
  const items = rows.map((r, i) => deriveItem(i, r))
  const orders = deriveOrders(items)

  const firstSeen = new Map<string, number>()
  for (const it of items) if (!firstSeen.has(it.so)) firstSeen.set(it.so, it.id)

  const customers = deriveCustomers(orders, firstSeen)
  const sum = (f: (o: PortalOrder) => number) => orders.reduce((a, o) => a + f(o), 0)

  const meta: PortalMeta = {
    exportDate: deriveExportDate(rows, fallbackDate),
    rows: items.length,
    orders: orders.length,
    customers: customers.length,
    backlog: sum((o) => o.backlog),
    contract: sum((o) => o.contract),
    delivered: sum((o) => o.dvalue),
    lateOrders: sum((o) => o.late),
    holdOrders: sum((o) => o.hold),
    bench: benchmarks(items),
    pms: countBy(items, (i) => i.pm),
    groups: countBy(items, (i) => i.grp),
  }

  return { meta, items, orders, customers }
}

export type { StageState }
