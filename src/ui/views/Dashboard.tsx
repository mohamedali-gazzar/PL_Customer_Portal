'use client'

/**
 * The first screen after signing in.
 *
 * Two figures, because those are the two a customer opens the portal to check:
 * what the work is worth, and how much of it is still outstanding. Everything
 * else — what is late, what is waiting on them — is carried by the project rows,
 * where it sits next to the project it concerns rather than as a count they then
 * have to go and act on.
 *
 * That is why there is no roll-up line here. A greeting, the two figures, then
 * the work.
 */

import { useMemo } from 'react'
import type { ScopedSnapshot } from '@/portal/types'
import { useT } from '../lib/i18n'
import { byYear, indexItems, itemsOf, orderYears, sum } from '../lib/select'
import { byWoStatus, type WoFilter } from '../lib/wo-status'
import { Kpis } from '../components/Kpis'
import { ProjectList } from '../components/ProjectList'
import { ProjectFilters } from '../components/ProjectFilters'

export function Dashboard({
  data,
  year,
  wo,
  onYearChange,
  onWoChange,
  onOpenProject,
}: {
  data: ScopedSnapshot
  year: string
  wo: WoFilter
  onYearChange: (year: string) => void
  onWoChange: (wo: WoFilter) => void
  onOpenProject: (so: string) => void
}) {
  const t = useT()
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const inYear = useMemo(() => byYear(data.orders, year), [data.orders, year])
  const orders = useMemo(() => byWoStatus(inYear, byId, wo), [inYear, byId, wo])

  const contract = sum(orders, (o) => o.contract)
  const backlog = sum(orders, (o) => o.backlog)
  const scope = year === 'all' ? t('kpi.allProjects') : t('kpi.orderedIn', { year })

  return (
    <>
      <div className="pgh">
        <h1 className="pt">{t('dash.welcome')}</h1>
      </div>

      <Kpis contract={contract} backlog={backlog} scope={scope} />

      <div className="sec-row">
        <div className="sec">{t('dash.yourProjects')}</div>
        <ProjectFilters
          orders={inYear}
          itemsById={byId}
          years={years}
          year={year}
          wo={wo}
          showing={orders.length}
          total={data.orders.length}
          onYearChange={onYearChange}
          onWoChange={onWoChange}
        />
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty">
            {t('filter.noMatch')}{' '}
            <button
              className="linkish"
              onClick={() => {
                onYearChange('all')
                onWoChange('all')
              }}
            >
              {t('filter.clear')}
            </button>
          </div>
        </div>
      ) : (
        <ProjectList orders={orders} items={data.items} onOpen={onOpenProject} />
      )}
    </>
  )
}
