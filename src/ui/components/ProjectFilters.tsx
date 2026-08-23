'use client'

/**
 * The project filter: when it was ordered.
 *
 * The count beside it is the result, not a decoration — "3 of 11 projects" is the
 * only number that matters once something is selected.
 */

import { useT } from '../lib/i18n'
import type { CustomerOrder } from '@/portal/types'

export function ProjectFilters({
  years,
  year,
  showing,
  total,
  onYearChange,
}: {
  years: readonly string[]
  year: string
  showing: number
  total: number
  onYearChange: (year: string) => void
}) {
  const t = useT()
  const filtered = year !== 'all'

  return (
    <div className="filters">
      <div className="filt">
        <label htmlFor="year-filter">{t('filter.orderYear')}</label>
        <span className="sel">
          <select id="year-filter" value={year} onChange={(e) => onYearChange(e.target.value)}>
            <option value="all">{t('filter.allProjects')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </span>
      </div>

      <span className="yf-count">
        {filtered
          ? t('filter.ofProjects', { shown: showing, total })
          : t('filter.projects', { n: total })}
      </span>
    </div>
  )
}
