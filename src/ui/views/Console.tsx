'use client'

/**
 * The internal Project Management console.
 *
 * The customer portal answers "where is my panel". This answers "where is the
 * business losing time", which is the question that pays for the portal: the
 * cycle-time chart shows customer approval at a 70-day median against 10 days for
 * drawing submission, and that is precisely the delay a portal removes, by telling
 * the customer a drawing is waiting on them the day it is sent.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { PortalSnapshot } from '@/portal/types'
import { STATE } from '@/portal/types'
import { STAGE_HEX, STAGE_NAMES, STAGE_SHORT, STAGE_GAP } from '@/portal/constants'
import { arw, egp, fd, full, ICO, int, Pill, short } from '../lib/format'
import { Tiles } from '../components/Tiles'
import { TipHead, TipRow, useTip } from '../lib/tooltip'

export function Console({
  snapshot,
  onOpenCustomer,
}: {
  snapshot: PortalSnapshot
  onOpenCustomer: (name: string) => void
}) {
  const bind = useTip()
  const [q, setQ] = useState('')
  const meta = snapshot.meta

  const inProcess = snapshot.items.filter((i) => i.woStatus === 'In Process').length
  const noWorkOrder = snapshot.items.filter((i) => !i.wo).length

  const backlogByPm = useMemo(() => {
    const m = new Map<string, { value: number; orders: number }>()
    for (const o of snapshot.orders) {
      const key = o.pm ?? 'Unassigned'
      const cur = m.get(key) ?? { value: 0, orders: 0 }
      m.set(key, { value: cur.value + o.backlog, orders: cur.orders + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].value - a[1].value)
  }, [snapshot.orders])

  const distribution = useMemo(() => {
    const d = [0, 0, 0, 0, 0, 0, 0]
    for (const i of snapshot.items) {
      const k = i.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
      d[k < 0 ? 6 : k] = (d[k < 0 ? 6 : k] ?? 0) + 1
    }
    return d
  }, [snapshot.items])

  const late = snapshot.orders.filter((o) => o.late).length
  const onTime = snapshot.orders.filter((o) => !o.late && o.dtc !== null).length
  const noDate = snapshot.orders.length - late - onTime

  const mostOverdue = useMemo(
    () =>
      snapshot.orders
        .filter((o) => o.dtc !== null && o.dtc < 0)
        .sort((a, b) => (a.dtc ?? 0) - (b.dtc ?? 0))
        .slice(0, 6),
    [snapshot.orders],
  )

  const customers = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return snapshot.customers
    const orderById = new Map(snapshot.orders.map((o) => [o.so, o]))
    return snapshot.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.orders.some(
          (so) =>
            so.toLowerCase().includes(needle) ||
            (orderById.get(so)?.proj ?? '').toLowerCase().includes(needle),
        ),
    )
  }, [q, snapshot.customers, snapshot.orders])

  const bench = meta.bench.filter((b) => b.count > 0)
  const maxDist = Math.max(...distribution, 1)

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Project Management Console</h1>
          <p className="psub">
            Internal view — all customers. {int(meta.rows)} item lines · {meta.orders} sales orders ·{' '}
            {meta.customers} customers · export {fd(meta.exportDate)}
          </p>
        </div>
        <Pill kind="info">Open backlog scope — delivered lines are excluded by the ERP query</Pill>
      </div>

      <Tiles
        tiles={[
          { lab: 'Open backlog', val: egp(meta.backlog), sub: `${int(meta.rows)} item lines` },
          { lab: 'Contract value', val: egp(meta.contract), sub: 'ordered value of open lines' },
          {
            lab: 'Orders past contractual',
            val: `${meta.lateOrders} / ${meta.orders}`,
            cls: 'crit',
            sub: `${Math.round((100 * meta.lateOrders) / meta.orders)}% of open orders`,
          },
          { lab: 'On hold', val: String(meta.holdOrders), cls: 'crit', sub: 'orders flagged on hold' },
          { lab: 'In manufacturing', val: String(inProcess), sub: 'work orders in process' },
          { lab: 'No work order yet', val: String(noWorkOrder), sub: 'item lines not released' },
        ]}
      />

      <div className="grid2x" style={{ marginTop: '16px' }}>
        {/* -- cycle times -- */}
        <div className="card chart">
          <h3>Phase cycle times</h3>
          <div className="cs">
            Days per phase, measured across completed transitions in this export.{' '}
            <b>Solid = median</b>, pale extension = 90th percentile — the tail your customers
            actually feel.
          </div>
          <HBars
            rows={bench.map((b, i) => ({
              name: b.n.replace(/^T\d /, ''),
              value: b.med,
              tail: b.p90,
              colour: STAGE_HEX[Math.min(6, i)]!,
              label: `${b.med}d`,
              tip: (
                <>
                  <TipHead swatch={STAGE_HEX[Math.min(6, i)]}>{b.n}</TipHead>
                  <TipRow label="Median" value={`${b.med} days`} />
                  <TipRow label="Average" value={`${b.avg} days`} />
                  <TipRow label="90th percentile" value={`${b.p90} days`} emphasis />
                  <TipRow label="Worst" value={`${b.max} days`} />
                  <TipRow label="Sample" value={`${b.count} lines`} />
                </>
              ),
            }))}
          />
          <div className="note" style={{ marginTop: '14px' }}>
            <b>Customer approval is the bottleneck.</b> Median 70 days against 10 days for drawings
            submission and 8 for manufacturing — and a 90th percentile of 203 days. This is the
            number the portal is built to move: the customer sees the drawing is waiting on them the
            day it is sent.
          </div>
        </div>

        {/* -- backlog by PM -- */}
        <div className="card chart">
          <h3>Open backlog by project manager</h3>
          <div className="cs">Value of undelivered panel lines, EGP.</div>
          <HBars
            rows={backlogByPm.map(([name, v]) => ({
              name,
              value: v.value,
              colour: 'var(--s4)',
              label: short(v.value),
              tip: (
                <>
                  <TipHead>{name}</TipHead>
                  <TipRow label="Open backlog" value={full(v.value)} />
                  <TipRow label="Orders" value={String(v.orders)} />
                </>
              ),
            }))}
          />
        </div>

        {/* -- stage distribution -- */}
        <div className="card chart">
          <h3>Where the {int(snapshot.items.length)} open item lines are sitting</h3>
          <div className="cs">Current stage per item line, computed by the Section 4 rules.</div>
          <div className="funnel">
            {distribution.map((n, i) => (
              <div
                className="fn"
                key={i}
                {...bind(
                  <>
                    <TipHead swatch={STAGE_HEX[i]}>{`${i + 1}. ${STAGE_NAMES[i]}`}</TipHead>
                    <TipRow label="Item lines here" value={String(n)} />
                    <TipRow label="Share" value={`${((100 * n) / snapshot.items.length).toFixed(1)}%`} />
                    {STAGE_GAP[i] ? <TipRow label="Note" value="no ERP source in export" emphasis /> : null}
                  </>,
                )}
              >
                <div className="vv num">{n}</div>
                <div
                  className="bx"
                  style={{
                    height: `${Math.max(4, Math.round((150 * n) / maxDist))}px`,
                    background: STAGE_HEX[i],
                    ...(STAGE_GAP[i] ? { opacity: 0.35 } : {}),
                    animationDelay: `${i * 60}ms`,
                  }}
                />
                <div className="lb">
                  {i + 1}. {STAGE_SHORT[i]}
                  {STAGE_GAP[i] ? (
                    <>
                      <br />
                      <span style={{ fontSize: '8.5px' }}>no ERP source</span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* -- contractual performance -- */}
        <div className="card chart">
          <h3>Contractual date performance</h3>
          <div className="cs">Open sales orders measured against their contractual delivery date.</div>
          <div className="stack">
            {(
              [
                [late, 'var(--critical)', 'Past date'],
                [onTime, 'var(--good)', 'Within date'],
                [noDate, '#D1D1D2', 'No date set'],
              ] as [number, string, string][]
            ).map(([n, colour, label], i) =>
              n ? (
                <i
                  key={label}
                  style={{
                    width: `${(100 * n) / snapshot.orders.length}%`,
                    background: colour,
                    animationDelay: `${i * 90}ms`,
                  }}
                  {...bind(
                    <>
                      <TipHead>{label}</TipHead>
                      <TipRow label="Orders" value={String(n)} />
                      <TipRow label="Share" value={`${((100 * n) / snapshot.orders.length).toFixed(1)}%`} />
                    </>,
                  )}
                />
              ) : null,
            )}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
            <Pill kind="bad">{`${late} past contractual date`}</Pill>
            <Pill kind="ok">{`${onTime} within date`}</Pill>
            <Pill kind="info">{`${noDate} no contractual date`}</Pill>
          </div>

          <div className="scrollx" style={{ marginTop: '18px' }}>
            <div className="sec" style={{ margin: '0 0 8px' }}>
              Most overdue orders
            </div>
            <table className="t">
              <tbody>
                {mostOverdue.map((o) => (
                  <tr key={o.so}>
                    <td>
                      <b>{o.so}</b>
                    </td>
                    <td>
                      <span className="trunc" style={{ maxWidth: '200px' }}>
                        {arw(o.cust)}
                      </span>
                    </td>
                    <td className="r num">{short(o.backlog)}</td>
                    <td className="r">
                      <span className="pill bad">
                        {ICO.bad}
                        {`${Math.abs(o.dtc ?? 0)}d late`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sec">All customers</div>
      <div className="toolbar">
        <input
          placeholder="Search customer, project or sales order…"
          style={{ minWidth: '300px' }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card scrollx">
        {customers.length === 0 ? (
          <div className="empty">No customer matches “{q}”.</div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="r">Orders</th>
                <th className="r">Lines</th>
                <th className="r">Open backlog</th>
                <th className="r">Progress</th>
                <th>Flags</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.name}>
                  <td>{arw(c.name)}</td>
                  <td className="r num">{c.nOrders}</td>
                  <td className="r num">{c.nItems}</td>
                  <td className="r num">{int(c.backlog)}</td>
                  <td className="r">
                    <b className="num">{c.pct}%</b>
                  </td>
                  <td>
                    {c.late ? <Pill kind="bad">{`${c.late} late`}</Pill> : null}
                    {c.await ? (
                      <>
                        {' '}
                        <Pill kind="warn">{`${c.await} awaiting drawings`}</Pill>
                      </>
                    ) : null}
                    {!c.late && !c.await ? <Pill kind="ok">Clear</Pill> : null}
                  </td>
                  <td className="r">
                    <button
                      className="row-open"
                      onClick={() => onOpenCustomer(c.name)}
                    >
                      Open portal →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* --------------------------------------------------------------- h-bars -- */

interface BarRow {
  name: string
  value: number
  /** A paler bar behind the solid one — used for the p90 tail. */
  tail?: number
  colour: string
  label: string
  tip?: ReactNode
}

function HBars({ rows }: { rows: readonly BarRow[] }) {
  const bind = useTip()
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.tail ?? 0)), 1)
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div className="hbar" key={r.name} {...(r.tip ? bind(r.tip) : {})}>
          <div className="nm">{r.name}</div>
          <div className="tr">
            {r.tail ? (
              <div
                className="tail"
                style={{ width: `${(100 * r.tail) / max}%`, background: r.colour, animationDelay: `${i * 55}ms` }}
              />
            ) : null}
            <div
              className="fl"
              style={{
                width: `${Math.max(0.6, (100 * r.value) / max)}%`,
                background: r.colour,
                animationDelay: `${i * 55}ms`,
              }}
            />
          </div>
          <div className="vl num">{r.label}</div>
        </div>
      ))}
    </div>
  )
}
