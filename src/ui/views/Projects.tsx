'use client'

/**
 * Projects: the list, and one project in full.
 *
 * The detail view is where the portal earns its keep — the item table says what
 * every panel is doing, and the timeline above it says how it got there.
 */

import { useMemo } from 'react'
import type { PortalItem, ScopedSnapshot } from '@/portal/types'
import { STATE } from '@/portal/types'
import { STAGE_NAMES } from '@/portal/constants'
import { arw, egp, fd, full, int, Pill } from '../lib/format'
import { useT, type Translate } from '../lib/i18n'
import { byYear, indexItems, itemsOf, orderYears } from '../lib/select'
import { byWoStatus, type WoFilter } from '../lib/wo-status'
import { Kpis } from '../components/Kpis'
import { PmContact } from '../components/PmContact'
import { ProjectFilters } from '../components/ProjectFilters'
import { ProjectList } from '../components/ProjectList'
import { Timeline } from '../components/Timeline'

export function Projects({
  data,
  so,
  year,
  wo,
  onYearChange,
  onWoChange,
  onOpenProject,
}: {
  data: ScopedSnapshot
  so: string | null
  year: string
  wo: WoFilter
  onYearChange: (year: string) => void
  onWoChange: (wo: WoFilter) => void
  onOpenProject: (so: string | null) => void
}) {
  const t = useT()
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const inYear = useMemo(() => byYear(data.orders, year), [data.orders, year])
  const shown = useMemo(() => byWoStatus(inYear, byId, wo), [inYear, byId, wo])
  const order = so ? data.orders.find((o) => o.so === so) ?? null : null

  if (order) {
    const items = itemsOf(order, byId)
    return (
      <>
        <div className="crumb">
          <button onClick={() => onOpenProject(null)}>Projects</button> <span>›</span>{' '}
          <span>{order.so}</span>
        </div>

        <div className="pgh">
          <div>
            <h1 className="pt">{arw(order.proj)}</h1>
            <p className="psub">
              {order.so} · {t('proj.ordered', { date: fd(order.soDate) })} ·{' '}
              {t('proj.contract', { value: full(order.contract) })} ·{' '}
              {t('proj.contractualDelivery', {
                date: order.cDate ? fd(order.cDate) : t('proj.notSet'),
              })}
              {order.cPeriod ? ` ${t('proj.dayPeriod', { n: order.cPeriod })}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '7px' }}>
            {order.hold ? <Pill kind="warn">{t('status.hold')}</Pill> : null}
            {order.late ? (
              <Pill kind="bad">{t('status.late')}</Pill>
            ) : (
              <Pill kind="ok">{t('proj.within')}</Pill>
            )}
            <Pill kind="info">{t('proj.complete', { n: order.pct })}</Pill>
          </div>
        </div>

        {/* The two figures and the person, on one row: the figures are capped at
            300px each and left the rest of the width empty, and who to call is the
            third thing worth knowing before the item table. */}
        <div className="sumrow">
          <Kpis
            contract={order.contract}
            backlog={order.backlog}
            scope={arw(order.proj)}
            contractNote={{ label: t('kpi.panelsOrdered'), value: int(order.qty) }}
            backlogNote={{
              label: t('kpi.panelsRemaining'),
              value: int(order.qty - order.deliv),
            }}
          />
          <PmContact pm={order.pm} />
        </div>

        <div className="sec">{t('proj.itemDetail')}</div>
        <ItemTable items={items} t={t} />

        <div className="sec">{t('proj.timeline')}</div>
        <Timeline order={order} items={items} today={data.meta.exportDate} />
      </>
    )
  }

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">{t('proj.title')}</h1>
          <p className="psub">
            {t('proj.salesOrders', { n: data.orders.length })}
          </p>
        </div>
        <ProjectFilters
          orders={inYear}
          itemsById={byId}
          years={years}
          year={year}
          wo={wo}
          showing={shown.length}
          total={data.orders.length}
          onYearChange={onYearChange}
          onWoChange={onWoChange}
        />
      </div>

      {shown.length === 0 ? (
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
        <ProjectList orders={shown} items={data.items} onOpen={onOpenProject} />
      )}
    </>
  )
}

function ItemTable({ items, t }: { items: readonly PortalItem[]; t: Translate }) {
  return (
    <div className="card scrollx">
      <table className="t">
        <thead>
          <tr>
            <th className="lineno">#</th>
            <th>{t('table.item')}</th>
            <th>{t('table.description')}</th>
            <th className="r">{t('table.qty')}</th>
            <th className="r">{t('table.delivered')}</th>
            <th>{t('table.workOrder')}</th>
            <th>{t('table.currentStage')}</th>
            <th>{t('table.material')}</th>
            <th className="r">{t('table.progress')}</th>
            <th className="r">{t('table.contractValue')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, line) => {
            const found = it.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
            const cur = found < 0 ? 6 : found
            const materialKind =
              it.matStatus === 'Available'
                ? 'ok'
                : it.matStatus === 'Partially Available'
                  ? 'warn'
                  : it.matStatus
                    ? 'bad'
                    : 'gap'
            return (
              <tr key={it.id}>
                <td className="lineno num">{line + 1}</td>
                <td>
                  <b>{it.code}</b>
                  {it.hold ? (
                    <>
                      {' '}
                      <Pill kind="warn">{t('table.hold')}</Pill>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className="trunc">{it.name ?? ''}</span>
                </td>
                <td className="r num">{it.qty}</td>
                <td className="r num">{it.deliv}</td>
                <td className="mono">{it.wo ?? '—'}</td>
                <td>
                  {`${cur + 1}. ${STAGE_NAMES[cur]}`}
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>{it.st[cur]![1]}</span>
                </td>
                <td>
                  <Pill kind={materialKind}>{it.matStatus ?? t('table.noWorkOrder')}</Pill>
                </td>
                <td className="r">
                  <b className="num">{it.pct}%</b>
                </td>
                <td className="r num">{it.contract !== null ? int(it.contract) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
