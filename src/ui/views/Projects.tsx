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
import { arw, egp, fd, full, int, Pill, s } from '../lib/format'
import { byYear, indexItems, itemsOf, orderYears } from '../lib/select'
import { YearFilter } from '../components/YearFilter'
import { Tiles } from '../components/Tiles'
import { ProjectCard } from '../components/ProjectCard'
import { Timeline } from '../components/Timeline'

export function Projects({
  data,
  so,
  year,
  onYearChange,
  onOpenProject,
}: {
  data: ScopedSnapshot
  so: string | null
  year: string
  onYearChange: (year: string) => void
  onOpenProject: (so: string | null) => void
}) {
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const shown = useMemo(() => byYear(data.orders, year), [data.orders, year])
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
              {order.so} · ordered {fd(order.soDate)} · contract {full(order.contract)} · contractual
              delivery {order.cDate ? fd(order.cDate) : 'not set'}
              {order.cPeriod ? ` (${order.cPeriod}-day period)` : ''} · PM: {order.pm ?? '—'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '7px' }}>
            {order.hold ? <Pill kind="warn">On hold</Pill> : null}
            {order.late ? (
              <Pill kind="bad">Past contractual date</Pill>
            ) : (
              <Pill kind="ok">Within contractual date</Pill>
            )}
            <Pill kind="info">{`${order.pct}% complete`}</Pill>
          </div>
        </div>

        <Tiles
          tiles={[
            {
              lab: 'Total contract value',
              val: egp(order.contract),
              sub: `${order.qty} panel${s(order.qty)} ordered`,
            },
            {
              lab: 'Total open backlog',
              val: egp(order.backlog),
              sub: `${order.qty - order.deliv} panel${s(order.qty - order.deliv)} remaining`,
            },
          ]}
        />

        <div className="sec">Item detail</div>
        <ItemTable items={items} />

        <div className="sec">Item milestone timeline</div>
        <Timeline order={order} items={items} today={data.meta.exportDate} />
      </>
    )
  }

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Projects</h1>
          <p className="psub">
            {data.orders.length} sales order{s(data.orders.length)}
          </p>
        </div>
        <YearFilter
          years={years}
          value={year}
          showing={shown.length}
          total={data.orders.length}
          onChange={onYearChange}
        />
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <div className="empty">
            No projects were ordered in {year}.{' '}
            <button className="linkish" onClick={() => onYearChange('all')}>
              Show all projects
            </button>
          </div>
        </div>
      ) : (
        <div className="grid2">
          {shown.map((o, i) => (
            <ProjectCard key={o.so} order={o} items={itemsOf(o, byId)} index={i} onOpen={onOpenProject} />
          ))}
        </div>
      )}
    </>
  )
}

function ItemTable({ items }: { items: readonly PortalItem[] }) {
  return (
    <div className="card scrollx">
      <table className="t">
        <thead>
          <tr>
            <th className="lineno">#</th>
            <th>Item</th>
            <th>Description</th>
            <th className="r">Qty</th>
            <th className="r">Delivered</th>
            <th>Work order</th>
            <th>Current stage</th>
            <th>Material</th>
            <th className="r">Progress</th>
            <th className="r">Contract value</th>
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
                      <Pill kind="warn">Hold</Pill>
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
                  <Pill kind={materialKind}>{it.matStatus ?? 'No work order'}</Pill>
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
