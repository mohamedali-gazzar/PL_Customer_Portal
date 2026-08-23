/**
 * The figures on the dashboard.
 *
 * They live here rather than inside the view for one reason: they are claims about
 * a customer's money and their obligations, and a wrong one is worse than a missing
 * one. "Delivered to date" understated means a customer thinks a shipment is lost;
 * "waiting for your approval" overstated means they go looking for a drawing that
 * is not with them. Both need to be assertable without a browser.
 *
 * Neither figure recomputes anything. `dvalue` is derived once, per order, in
 * `derive.ts`, and the stage ladder is owned by the report — reading them here and
 * deriving them again elsewhere is how two screens end up disagreeing.
 */

import { AWAITING_APPROVAL_STAGE } from './milestones'
import type { CustomerItem, CustomerOrder } from './types'

/**
 * What has actually shipped, in money.
 *
 * Summed from the orders in view so it follows the year filter — a customer
 * filtering to 2025 is asking what 2025 delivered, not what the account has
 * delivered since it opened.
 */
export function deliveredToDate(orders: readonly CustomerOrder[]): number {
  return orders.reduce((total, o) => total + o.dvalue, 0)
}

/**
 * Lines sitting in the customer's own court.
 *
 * Counted from the report's stage number, never from the badge text: the text is a
 * rendering of the state and is translated, so counting it would produce a
 * different number in Arabic. Stage 2 is Drawings Approval, the one stage the
 * phase model places with the customer.
 *
 * Scoped to the orders on screen so the figure agrees with the rows beneath it.
 */
export function awaitingYourApproval(
  orders: readonly CustomerOrder[],
  items: readonly CustomerItem[],
): number {
  const shown = new Set(orders.map((o) => o.so))
  return items.filter((i) => shown.has(i.so) && i.stage === AWAITING_APPROVAL_STAGE).length
}
