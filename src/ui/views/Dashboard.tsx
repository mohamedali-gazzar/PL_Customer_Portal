'use client'

/**
 * The first screen after signing in.
 *
 * Two figures, because those are the two a customer opens the portal to check:
 * what the work is worth, and how much of it is still outstanding. Everything
 * else — what is late, what is waiting on them — is carried by the project cards,
 * where it sits next to the project it concerns rather than as a number they then
 * have to go and locate.
 */

import { useMemo } from 'react'
import type { ScopedSnapshot } from '@/portal/types'
import { arw, egp, fd, Pill, s } from '../lib/format'
import { byYear, indexItems, itemsOf, orderYears, sum } from '../lib/select'
import { byWoStatus, type WoFilter } from '../lib/wo-status'
import { Tiles } from '../components/Tiles'
import { ProjectCard } from '../components/ProjectCard'
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
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const inYear = useMemo(() => byYear(data.orders, year), [data.orders, year])
  const orders = useMemo(() => byWoStatus(inYear, byId, wo), [inYear, byId, wo])

  const contract = sum(orders, (o) => o.contract)
  const backlog = sum(orders, (o) => o.backlog)
  const late = orders.filter((o) => o.late).length
  const scope = year === 'all' ? 'across all projects' : `ordered in ${year}`

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Welcome back</h1>
          <p className="psub">
            {arw(data.customer.name)} · data as at {fd(data.meta.exportDate)}
          </p>
        </div>
        {late ? (
          <Pill kind="bad">{`${late} order${s(late)} past contractual date`}</Pill>
        ) : (
          <Pill kind="ok">All orders within contractual date</Pill>
        )}
      </div>

      <Tiles
        tiles={[
          { lab: 'Total contract value', val: egp(contract), sub: scope },
          {
            lab: 'Total open backlog',
            val: egp(backlog),
            sub: contract ? `${((100 * backlog) / contract).toFixed(1)}% of contract value` : '—',
          },
        ]}
      />

      <div className="sec-row">
        <div className="sec">Your projects</div>
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
            No projects match these filters.{' '}
            <button
              className="linkish"
              onClick={() => {
                onYearChange('all')
                onWoChange('all')
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <div className="grid2">
          {orders.map((o, i) => (
            <ProjectCard
              key={o.so}
              order={o}
              items={itemsOf(o, byId)}
              index={i}
              onOpen={onOpenProject}
            />
          ))}
        </div>
      )}
    </>
  )
}
