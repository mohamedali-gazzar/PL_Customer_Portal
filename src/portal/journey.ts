/**
 * The panel's journey, as a customer would narrate it.
 *
 * The seven milestones in `STAGE_NAMES` are the ERP's model: they exist because
 * each one is derivable from a document. They begin at drawings approval, because
 * that is the first thing the ERP records — but that is not where a customer's
 * order begins. It begins when they place it, and it ends when the panel arrives.
 *
 * So this is a second, narrower view of the same data: nine levels, in the order
 * things actually happen, from "Order placed" to "Delivery". Nothing new is
 * measured. Levels 1–5 are the T1–T5 phases already in the timestamp chain, and
 * the last three read the milestones. It is a relabelling of facts, not a source.
 */

import { PHASES } from './constants'
import { STATE, type PortalItem } from './types'

export const JOURNEY_LABELS = [
  'Order placed',
  'Preparing drawings',
  'Drawing approval',
  'Releasing to production',
  'Gathering material',
  'Manufacturing',
  'Quality check',
  'FAT',
  'Delivery',
] as const

/**
 * An ordinal ramp: one hue, brightening monotonically, so position in the journey
 * is carried by lightness alone and survives greyscale and colour-vision
 * deficiency. It brightens rather than darkens because the interface ground is
 * near-black — a darkening ramp vanished into it. Level 0 is neutral, because
 * placing an order is a moment rather than a phase.
 */
export const JOURNEY_HEX = [
  '#949496', '#9C5228', '#AE5C2B', '#C0672F', '#D07434', '#DE8543', '#E89C60', '#F0B183', '#F5C6A3',
] as const

export type LevelState = 'done' | 'active' | 'pending'

export interface JourneyLevel {
  readonly n: number
  readonly label: string
  readonly state: LevelState
  readonly status: string
  readonly from: string | null
  readonly to: string | null
  /** Days the level took, or has been open for. */
  readonly days: number | null
  readonly planned: string | null
  /** What this level means, for the tooltip. */
  readonly what: string
}

const DAY = 86_400_000
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const span = (a: string | null, b: string | null): number | null =>
  a && b ? Math.round((at(b) - at(a)) / DAY) : null

const WHAT = [
  'The day you placed this order with us.',
  'Our engineers draw the panel and send it to you for approval.',
  'The drawing is with you. Nothing can be built until it comes back approved.',
  'Your approved drawing is released to the shop floor as a work order.',
  'Every component for your panel is being collected and booked to the job.',
  'Your panel is assembled, wired and tested on the production line.',
  'The panel is inspected, and any final adjustments are made.',
  'Factory Acceptance Test — the panel is signed off before it leaves.',
  'The panel is packed, dispatched, and delivered to your site.',
] as const

/**
 * Build the nine levels for one panel.
 *
 * Completion comes from the data; only *one* level is ever `active` — the frontier,
 * the first that is not finished. Marking every unfinished level as in-progress
 * would tell a customer that eight things are happening at once when one is.
 */
export function journeyOf(item: PortalItem, today: string): JourneyLevel[] {
  const ch = item.ch
  const on = (i: number): string | null => ch[i] ?? null

  const reworkRaised = on(6)
  const reworkClosed = on(8)
  const manufactured = on(5)
  const fat = item.st[3]!
  const delivery = item.st[5]!

  const fullyDelivered = item.qty > 0 && item.deliv >= item.qty

  /** Per level: is it finished, and what dates bound it. */
  const rows: { done: boolean; from: string | null; to: string | null; status: string; planned: string | null }[] = [
    // 0 — Order placed
    {
      done: Boolean(item.soDate),
      from: item.soDate,
      to: item.soDate,
      status: item.soDate ? 'Ordered' : 'Not recorded',
      planned: null,
    },
    // 1–5 — the T1–T5 phases, straight from the chain
    ...[0, 1, 2, 3, 4].map((k) => ({
      done: Boolean(on(k + 1)),
      from: on(k),
      to: on(k + 1),
      status: on(k + 1) ? 'Complete' : on(k) ? PHASES[k]!.n : 'Not started',
      planned: k === 3 ? item.st[1]![4] : k === 4 ? item.st[2]![4] : null,
    })),
    // 6 — Quality check. No rework raised on a finished panel means nothing needed
    //     adjusting, which is a pass, not an omission.
    {
      done: reworkRaised ? Boolean(reworkClosed) : Boolean(manufactured),
      from: reworkRaised ?? manufactured,
      to: reworkClosed ?? (reworkRaised ? null : manufactured),
      status: reworkClosed
        ? 'Adjustments complete'
        : reworkRaised
          ? 'Final adjustments in progress'
          : manufactured
            ? 'Passed, no adjustments needed'
            : 'Not started',
      planned: item.st[3]![4],
    },
    // 7 — FAT.
    //     The milestone this reads from covers both rework and FAT, and rework is
    //     now level 6's story. So a completed milestone only counts as a passed FAT
    //     when no rework was involved; otherwise it means "adjustments finished",
    //     which would otherwise print the rework wording under a FAT heading.
    {
      done: fat[0] === STATE.done && item.rework === 0,
      from: fat[2],
      to: fat[3],
      status:
        fat[0] === STATE.gap
          ? 'Awaiting ERP feed'
          : reworkRaised && !reworkClosed
            ? 'Awaiting quality sign-off'
            : fat[1],
      planned: fat[4],
    },
    // 8 — Delivery
    {
      done: fullyDelivered,
      from: delivery[2],
      to: fullyDelivered ? delivery[3] ?? item.cDate : null,
      status: delivery[0] === STATE.gap ? 'Awaiting ERP feed' : delivery[1],
      planned: delivery[4],
    },
  ]

  /*
   * A level with no timestamp of its own, but with a later level finished, is
   * behind us — work demonstrably moved past it. The ERP simply never recorded it.
   *
   * This is not a rare edge: 50 of the 480 lines in the current export carry no
   * initial-drawing submission. Without this pass, such a panel shows "Preparing
   * drawings — in progress" beside a completed Manufacturing, which is not merely
   * untidy but a contradiction the customer is entitled to disbelieve.
   *
   * The level is marked complete, and says "Not recorded" rather than borrowing a
   * date it does not have.
   */
  const implied = rows.map(() => false)
  let laterDone = false
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (laterDone && !rows[i]!.done) implied[i] = true
    if (rows[i]!.done) laterDone = true
  }

  const complete = rows.map((r, i) => r.done || implied[i]!)
  const frontier = complete.findIndex((c) => !c)

  return rows.map((r, i) => {
    const state: LevelState = complete[i] ? 'done' : i === frontier ? 'active' : 'pending'
    // A finished level reports how long it took; the one in progress reports how
    // long it has been running, which is the number a customer is chasing.
    const days = implied[i] ? null : r.done ? span(r.from, r.to) : state === 'active' ? span(r.from, today) : null
    return {
      n: i,
      label: JOURNEY_LABELS[i]!,
      state,
      status: implied[i] ? 'Not recorded' : r.status,
      from: implied[i] ? null : r.from,
      to: implied[i] ? null : r.to,
      days,
      planned: r.planned,
      what: WHAT[i]!,
    }
  })
}
