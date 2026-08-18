'use client'

/**
 * The project filters: when it was ordered, and where it stands.
 *
 * Each status option carries its own count, so the shape of the portfolio is
 * visible before anything is selected — "Past contractual date (62)" answers the
 * question that would otherwise take four clicks to ask.
 *
 * One row, one total. Two independent tallies would leave the reader working out
 * the intersection themselves; a single "3 of 11 projects" states the result of
 * both, which is the only number that matters.
 */

import { PROJECT_STATUSES, statusCounts, type StatusFilter } from '../lib/status'
import { s } from '../lib/format'
import type { PortalOrder } from '@/portal/types'

export function ProjectFilters({
  orders,
  years,
  year,
  status,
  showing,
  total,
  onYearChange,
  onStatusChange,
}: {
  /** Scoped by year but not by status, so the counts do not vanish as you filter. */
  orders: readonly PortalOrder[]
  years: readonly string[]
  year: string
  status: StatusFilter
  showing: number
  total: number
  onYearChange: (year: string) => void
  onStatusChange: (status: StatusFilter) => void
}) {
  const counts = statusCounts(orders)
  const filtered = year !== 'all' || status !== 'all'

  return (
    <div className="filters">
      <div className="filt">
        <label htmlFor="year-filter">Order year</label>
        <select id="year-filter" value={year} onChange={(e) => onYearChange(e.target.value)}>
          <option value="all">All projects</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="filt">
        <label htmlFor="status-filter">Status</label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        >
          <option value="all">Any status</option>
          {PROJECT_STATUSES.map((st) => (
            // A status nothing is in is still listed, disabled — its absence is
            // information, and a vanishing option looks like a bug.
            <option key={st.key} value={st.key} disabled={counts[st.key] === 0}>
              {`${st.label} (${counts[st.key]})`}
            </option>
          ))}
        </select>
      </div>

      <span className="yf-count">
        {filtered ? `${showing} of ${total} project${s(total)}` : `${total} project${s(total)}`}
      </span>
    </div>
  )
}
