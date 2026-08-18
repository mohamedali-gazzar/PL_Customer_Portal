'use client'

/**
 * Filter the portfolio by the year an order was placed.
 *
 * A visible label rather than a placeholder, so the control still says what it
 * filters once a year is chosen, and the count travels with it — a filter that
 * hides most of the list should say how much it is hiding.
 */

import { s } from '../lib/format'

export function YearFilter({
  years,
  value,
  showing,
  total,
  onChange,
}: {
  years: readonly string[]
  value: string
  showing: number
  total: number
  onChange: (year: string) => void
}) {
  return (
    <div className="yearfilter">
      <label htmlFor="year-filter">Order year</label>
      <select id="year-filter" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All projects</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <span className="yf-count">
        {value === 'all'
          ? `${total} project${s(total)}`
          : `${showing} of ${total} project${s(total)}`}
      </span>
    </div>
  )
}
