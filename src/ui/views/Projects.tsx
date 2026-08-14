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
import { indexItems, itemsOf } from '../lib/select'
import { Tiles } from '../components/Tiles'
import { ProjectCard } from '../components/ProjectCard'
import { Timeline } from '../components/Timeline'

export function Projects({
  data,
  so,
  onOpenProject,
}: {
  data: ScopedSnapshot
  so: string | null
  onOpenProject: (so: string | null) => void
}) {
  const byId = useMemo(() => indexItems(data.items), [data.items])
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
            { lab: 'Contract value', val: egp(order.contract), sub: `${order.qty} panels ordered` },
            {
              lab: 'Delivered',
              val: egp(order.dvalue),
              cls: order.dvalue > 0 ? 'good' : '',
              sub: `${order.deliv} of ${order.qty} panels`,
            },
            {
              lab: 'Open backlog',
              val: egp(order.backlog),
              sub: `${order.qty - order.deliv} panels remaining`,
            },
            {
              lab: 'Order age',
              val: order.age !== null ? String(order.age) : '—',
              sub: 'days since sales order',
            },
            {
              lab: 'To contractual date',
              val: order.dtc !== null ? (order.dtc < 0 ? String(order.dtc) : `+${order.dtc}`) : '—',
              cls: order.dtc !== null && order.dtc < 0 ? 'crit' : '',
              sub: order.dtc !== null ? (order.dtc < 0 ? 'days overdue' : 'days remaining') : 'no date set',
            },
          ]}
        />

        <div className="sec">Item milestone timeline</div>
        <Timeline order={order} items={items} today={data.meta.exportDate} />

        <div className="sec">Item detail</div>
        <ItemTable items={items} />
      </>
    )
  }

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Projects</h1>
          <p className="psub">
            {data.orders.length} sales order{s(data.orders.length)} · click any project for the
            item-level milestone timeline
          </p>
        </div>
      </div>
      <div className="grid2">
        {data.orders.map((o, i) => (
          <ProjectCard key={o.so} order={o} items={itemsOf(o, byId)} index={i} onOpen={onOpenProject} />
        ))}
      </div>
    </>
  )
}

function ItemTable({ items }: { items: readonly PortalItem[] }) {
  return (
    <div className="card scrollx">
      <table className="t">
        <thead>
          <tr>
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
          {items.map((it) => {
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
