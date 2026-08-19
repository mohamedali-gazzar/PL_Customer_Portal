'use client'

/**
 * The KPI band.
 *
 * Three figures in one panel rather than three floating cards, because they are
 * three views of the same money: what was ordered, what has arrived, and what is
 * still owed. Grouping them says so, and buys one strong edge instead of three
 * competing ones.
 *
 * The share bar underneath is what the three separate tiles could never show —
 * the proportion. "EGP 28.31M open" means little on its own; "100% of contract
 * value still open" is the sentence a customer actually reads it as.
 */

import type { ReactNode } from 'react'
import { egp, full, int } from '../lib/format'
import { useTip, TipHead, TipRow } from '../lib/tooltip'

/* Line icons, 16px grid, 1.9 stroke — one family, one weight. */
const ICONS = {
  contract: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5h7.5L16 6v11.5H5z" />
      <path d="M12 2.5V6h4" />
      <path d="M7.75 10.5h5.5M7.75 13.5h3.5" />
    </svg>
  ),
  delivered: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5 10 2.75l7.5 3.75v7L10 17.25 2.5 13.5z" />
      <path d="M2.5 6.5 10 10.25l7.5-3.75M10 10.25v7" />
    </svg>
  ),
  backlog: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4.25l3 1.75" />
    </svg>
  ),
} as const

export function Kpis({
  contract,
  delivered,
  backlog,
  scope,
  panels,
  panelsDelivered,
}: {
  contract: number
  delivered: number
  backlog: number
  scope: string
  panels: number
  panelsDelivered: number
}) {
  const bind = useTip()
  const pctDelivered = contract > 0 ? (100 * delivered) / contract : 0
  const pctOpen = contract > 0 ? (100 * backlog) / contract : 0

  return (
    <div className="kpis">
      <div
        className="kpi"
        {...bind(
          <>
            <TipHead>Total contract value</TipHead>
            <TipRow label="Exact" value={full(contract)} />
            <TipRow label="Scope" value={scope} />
            <TipRow label="Panels ordered" value={int(panels)} />
          </>,
        )}
      >
        <div className="kpi-top">
          <span className="kpi-ico">{ICONS.contract}</span>
          <span className="kpi-lab">Total contract value</span>
        </div>
        <div className="kpi-val">{egp(contract)}</div>
        <div className="kpi-sub">
          {scope} · <b>{int(panels)}</b> panels ordered
        </div>
      </div>

      <div
        className="kpi muted-kpi"
        {...bind(
          <>
            <TipHead>Delivered to date</TipHead>
            <TipRow label="Exact" value={full(delivered)} />
            <TipRow label="Panels delivered" value={`${int(panelsDelivered)} of ${int(panels)}`} />
          </>,
        )}
      >
        <div className="kpi-top">
          <span className="kpi-ico">{ICONS.delivered}</span>
          <span className="kpi-lab">Delivered</span>
        </div>
        <div className="kpi-val">{egp(delivered)}</div>
        <div className="kpi-sub">
          <b>{int(panelsDelivered)}</b> of {int(panels)} panels · {pctDelivered.toFixed(1)}% of value
        </div>
      </div>

      <div
        className="kpi lead"
        {...bind(
          <>
            <TipHead>Open backlog</TipHead>
            <TipRow label="Exact" value={full(backlog)} />
            <TipRow label="Share of contract" value={`${pctOpen.toFixed(1)}%`} emphasis />
            <TipRow label="Panels remaining" value={int(panels - panelsDelivered)} />
          </>,
        )}
      >
        <div className="kpi-top">
          <span className="kpi-ico">{ICONS.backlog}</span>
          <span className="kpi-lab">Open backlog</span>
        </div>
        <div className="kpi-val">{egp(backlog)}</div>
        <div className="kpi-sub">
          <b>{pctOpen.toFixed(1)}%</b> of contract value not yet delivered
        </div>
      </div>

      {contract > 0 ? (
        <div className="kpi-share">
          <span className="k">
            <span className="dot" style={{ background: 'var(--good)' }} />
            Delivered <b>{pctDelivered.toFixed(1)}%</b>
          </span>
          <span className="track" role="img" aria-label={`${pctDelivered.toFixed(1)}% delivered, ${pctOpen.toFixed(1)}% still open`}>
            <i className="done" style={{ width: `${pctDelivered}%` }} />
            <i className="open" style={{ width: `${pctOpen}%` }} />
          </span>
          <span className="k">
            <span className="dot" style={{ background: 'var(--brand)' }} />
            Open <b>{pctOpen.toFixed(1)}%</b>
          </span>
        </div>
      ) : null}
    </div>
  )
}

export type { ReactNode }
