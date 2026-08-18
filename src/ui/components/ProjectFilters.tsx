'use client'

/**
 * The project filters: when it was ordered, and how much of it is still open.
 *
 * One row, one count. Two independent controls each with their own tally would make
 * the reader work out the intersection themselves; a single "3 of 11 projects"
 * states the result of both, which is the only number that matters.
 *
 * Labels stay visible after a choice is made, so the row still says what it filters
 * rather than becoming two unexplained values.
 */

import { BACKLOG_BANDS, type BacklogBand } from '../lib/select'
import { s } from '../lib/format'

export function ProjectFilters({
  years,
  year,
  band,
  showing,
  total,
  onYearChange,
  onBandChange,
}: {
  years: readonly string[]
  year: string
  band: BacklogBand
  showing: number
  total: number
  onYearChange: (year: string) => void
  onBandChange: (band: BacklogBand) => void
}) {
  const filtered = year !== 'all' || band !== 'all'
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
        <label htmlFor="backlog-filter">Open backlog</label>
        <select
          id="backlog-filter"
          value={band}
          onChange={(e) => onBandChange(e.target.value as BacklogBand)}
        >
          <option value="all">Any value</option>
          {BACKLOG_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
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
