'use client'

/**
 * The first screen after signing in.
 *
 * It answers "is anything wrong, and is anything waiting on me" before it answers
 * anything else — the headline pill and the "Needs your action" tile are the two
 * things a customer came to find out.
 */

import { useMemo } from 'react'
import type { ScopedSnapshot } from '@/portal/types'
import { arw, egp, fd, Pill, s } from '../lib/format'
import { indexItems, itemsOf, sum } from '../lib/select'
import { GapTip, Tiles } from '../components/Tiles'
import { ProjectCard } from '../components/ProjectCard'

export function Dashboard({
  data,
  onOpenProject,
}: {
  data: ScopedSnapshot
  onOpenProject: (so: string) => void
}) {
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const orders = data.orders

  const contract = sum(orders, (o) => o.contract)
  const backlog = sum(orders, (o) => o.backlog)
  const delivered = sum(orders, (o) => o.dvalue)
  const late = orders.filter((o) => o.late).length
  const awaiting = orders.filter((o) => o.await).length

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Welcome back</h1>
          <p className="psub">
            {arw(data.customer.name)} · {orders.length} order{s(orders.length)} · {data.items.length}{' '}
            panel line{s(data.items.length)} · data as at {fd(data.meta.exportDate)}
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
          {
            lab: 'Contract value',
            val: egp(contract),
            sub: `across ${orders.length} sales order${s(orders.length)}`,
          },
          {
            lab: 'Delivered to date',
            val: egp(delivered),
            cls: delivered > 0 ? 'good' : '',
            sub: contract ? `${((100 * delivered) / contract).toFixed(1)}% of contract value` : '—',
          },
          { lab: 'Open backlog', val: egp(backlog), sub: 'value not yet delivered' },
          {
            lab: 'Invoiced',
            val: egp(0),
            cls: 'pend',
            gap: true,
            sub: 'awaiting Sales Invoice feed',
            tip: (
              <GapTip>
                This export contains no Sales Invoice rows. Wire the BFF to Sales Invoice to
                populate.
              </GapTip>
            ),
          },
          {
            lab: 'Outstanding',
            val: egp(0),
            cls: 'pend',
            gap: true,
            sub: 'awaiting Payment Entry feed',
            tip: (
              <GapTip>
                This export contains no Payment Entry rows. Wire the BFF to Payment Entry to
                populate.
              </GapTip>
            ),
          },
          {
            lab: 'Needs your action',
            val: String(awaiting),
            cls: awaiting ? 'crit' : '',
            sub: awaiting ? 'drawing approval pending' : 'nothing pending with you',
          },
        ]}
      />

      <div className="sec">Your projects</div>
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

      <div className="note gapn" style={{ marginTop: '22px' }}>
        <b>Where these numbers come from.</b> Contract value, delivered value and open backlog are
        computed from the Sales Order quantities and rates in your ERP export. Invoiced, paid,
        outstanding and overdue need the Sales Invoice and Payment Entry doctypes, which are not in
        this export — they are shown as zero and marked, never estimated.
      </div>
    </>
  )
}
