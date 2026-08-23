'use client'

/**
 * The first screen after signing in.
 *
 * Four figures, in the order a customer reads them: what the work is worth, how
 * much is still outstanding, how much has shipped, and how much is sitting with
 * them. The first three are money and answer "where does the account stand". The
 * fourth is a count and is the only one that asks for anything — it is last
 * because a number that wants an action reads better after the context for it.
 *
 * Everything else — what is late, which project — is carried by the rows below,
 * next to the project it concerns rather than as a total they then have to go and
 * chase down. That is why there is no roll-up line here.
 */

import { useMemo } from 'react'
import type { ScopedSnapshot } from '@/portal/types'
import { useT } from '../lib/i18n'
import { byYear, indexItems, itemsOf, orderYears, sum } from '../lib/select'
import { awaitingYourApproval, deliveredToDate } from '@/portal/kpis'
import { Kpis } from '../components/Kpis'
import { ProjectList } from '../components/ProjectList'
import { ProjectFilters } from '../components/ProjectFilters'

export function Dashboard({
  data,
  year,
  onYearChange,
  onOpenProject,
}: {
  data: ScopedSnapshot
  year: string
  onYearChange: (year: string) => void
  onOpenProject: (so: string) => void
}) {
  const t = useT()
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const orders = useMemo(() => byYear(data.orders, year), [data.orders, year])

  const contract = sum(orders, (o) => o.contract)
  const backlog = sum(orders, (o) => o.backlog)
  // Both already derived; the view reads them rather than recomputing. See kpis.ts.
  const delivered = deliveredToDate(orders)
  const awaiting = useMemo(
    () => awaitingYourApproval(orders, data.items),
    [orders, data.items],
  )
  const scope = year === 'all' ? t('kpi.allProjects') : t('kpi.orderedIn', { year })

  return (
    <>

      <Kpis
        contract={contract}
        backlog={backlog}
        delivered={delivered}
        awaiting={awaiting}
        scope={scope}
      />

      <div className="sec-row">
        <div className="sec">{t('dash.yourProjects')}</div>
        <ProjectFilters
          years={years}
          year={year}
          showing={orders.length}
          total={data.orders.length}
          onYearChange={onYearChange}
        />
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty">
            {t('filter.noMatch')}{' '}
            <button
              className="linkish"
              onClick={() => onYearChange('all')}
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
