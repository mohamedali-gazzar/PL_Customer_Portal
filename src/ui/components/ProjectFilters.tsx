'use client'

/**
 * The project filters: when it was ordered, and where its work orders stand.
 *
 * Each option carries its own count, so the shape of the portfolio is visible
 * before anything is selected — "No work order yet (48)" answers the question that
 * would otherwise take four clicks to ask.
 *
 * One row, one total. Two independent tallies would leave the reader working out
 * the intersection themselves; a single "3 of 11 projects" states the result of
 * both, which is the only number that matters.
 */

import { WO_STATUSES, woStatusCounts, type WoFilter } from '../lib/wo-status'
import { s } from '../lib/format'
import type { PortalItem, PortalOrder } from '@/portal/types'

export function ProjectFilters({
  orders,
  itemsById,
  years,
  year,
  wo,
  showing,
  total,
  onYearChange,
  onWoChange,
}: {
  /** Scoped by year but not by work order, so the counts do not vanish as you filter. */
  orders: readonly PortalOrder[]
  itemsById: Map<number, PortalItem>
  years: readonly string[]
  year: string
  wo: WoFilter
  showing: number
  total: number
  onYearChange: (year: string) => void
  onWoChange: (wo: WoFilter) => void
}) {
  const counts = woStatusCounts(orders, itemsById)
  const filtered = year !== 'all' || wo !== 'all'

  return (
    <div className="filters">
      <div className="filt">
        <label htmlFor="year-filter">Order year</label>
        <span className="sel">
          <select id="year-filter" value={year} onChange={(e) => onYearChange(e.target.value)}>
            <option value="all">All projects</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="filt">
        <label htmlFor="wo-filter">Work order</label>
        <span className="sel">
          <select id="wo-filter" value={wo} onChange={(e) => onWoChange(e.target.value as WoFilter)}>
            <option value="all">Any status</option>
            {WO_STATUSES.map((st) => (
              // A status nothing is in is still listed, disabled — its absence is
              // information, and a vanishing option looks like a bug.
              <option key={st.key} value={st.key} disabled={counts[st.key] === 0}>
                {`${st.label} (${counts[st.key]})`}
              </option>
            ))}
          </select>
        </span>
      </div>

      <span className="yf-count">
        {filtered ? `${showing} of ${total} project${s(total)}` : `${total} project${s(total)}`}
      </span>
    </div>
  )
}
