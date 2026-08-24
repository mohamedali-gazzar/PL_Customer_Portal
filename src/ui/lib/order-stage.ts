/**
 * Where an order has got to — one line, from the item lines under it.
 *
 * This lives apart from the component that renders it for one reason: Node can
 * run TypeScript natively but not TSX, so anything inside a .tsx file is beyond
 * the reach of the test runner. That is not academic here. The delivered case
 * below was silently returning null and leaving the Stage column blank on every
 * row of History, and no test could have caught it while the function sat in the
 * component file. The message catalogue was moved out of i18n.tsx for the same
 * reason.
 */

import type { CustomerItem } from '@/portal/types'
import { STAGES, visibleStageOf } from '@/portal/milestones'
import { statusKeyOf } from '@/portal/journey'

export interface OrderStage {
  readonly stage: string
  readonly stageKey: string
  /** Null once there is no step left to be in — the order has arrived. */
  readonly status: string | null
  readonly statusKey: string | null
}

/**
 * Where this order has got to.
 *
 * Taken from the least-advanced line, because an order is only as ready as its
 * slowest panel — reporting the furthest-along line would flatter the schedule.
 *
 * Both halves come from the report: the milestone from `Current Stage #` and the
 * wording from `Current Step`. The portal used to work this out from its own chain
 * of timestamps, which meant two rules for one question. Spec, Delta 3.
 *
 * An order with nothing left running has no next thing to name, and this used to
 * answer null for it — which left the column empty on every row of History, where
 * every order is finished. Blank reads as missing data, not as done. It now
 * answers with the arrival itself, and `now.delivered` is the same word the
 * journey gives a delivered line, so the list and the item page agree.
 */
export function stageOf(items: readonly CustomerItem[]): OrderStage | null {
  // No lines at all is absence of information, not delivery.
  if (items.length === 0) return null

  const pending = items.filter((i) => i.pct < 100)
  if (pending.length === 0) {
    return { stage: 'Delivered', stageKey: 'now.delivered', status: null, statusKey: null }
  }

  const slowest = pending.reduce((a, b) => (b.stage < a.stage ? b : a))
  const spec = STAGES[visibleStageOf(slowest.stage)]
  if (!spec) return null
  const status = slowest.step ?? 'Not started'
  // Keys as well as words: this line is the only place on the dashboard that names
  // a stage, and it was reaching the Arabic screen in English.
  return {
    stage: spec.name,
    stageKey: spec.nameKey,
    status,
    statusKey: slowest.step ? statusKeyOf(slowest.step) : 'table.notStarted',
  }
}
