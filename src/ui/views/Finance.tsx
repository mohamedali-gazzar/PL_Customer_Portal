'use client'

/**
 * Finance.
 *
 * Four of the seven tiles are placeholders, and they say so rather than reading
 * zero. The whole commercial argument for this portal is that a customer can see
 * their position without ringing anyone; a figure that is silently wrong would
 * destroy that faster than a missing one ever could.
 */

import type { ScopedSnapshot } from '@/portal/types'
import { arw, egp, fd, int, Pill } from '../lib/format'
import { sum } from '../lib/select'
import { GapTip, Tiles } from '../components/Tiles'

export function Finance({ data }: { data: ScopedSnapshot }) {
  const orders = data.orders
  const contract = sum(orders, (o) => o.contract)
  const backlog = sum(orders, (o) => o.backlog)
  const delivered = sum(orders, (o) => o.dvalue)

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Finance</h1>
          <p className="psub">
            {arw(data.customer.name)} · all figures in document currency (EGP) · as at{' '}
            {fd(data.meta.exportDate)}
          </p>
        </div>
      </div>

      <Tiles
        tiles={[
          { lab: 'Contract value', val: egp(contract), sub: 'sum of sales order lines' },
          {
            lab: 'Delivered value',
            val: egp(delivered),
            cls: delivered > 0 ? 'good' : '',
            sub: 'delivered qty × line rate',
          },
          { lab: 'Open backlog', val: egp(backlog), sub: 'remaining qty × line rate' },
          {
            lab: 'Invoiced',
            val: egp(0),
            cls: 'pend',
            gap: true,
            sub: 'awaiting Sales Invoice feed',
            tip: (
              <GapTip>
                Needs Sales Invoice: name, posting_date, due_date, grand_total, outstanding_amount,
                status.
              </GapTip>
            ),
          },
          {
            lab: 'Paid',
            val: egp(0),
            cls: 'pend',
            gap: true,
            sub: 'awaiting Payment Entry feed',
            tip: (
              <GapTip>
                Needs Payment Entry: payment_type=Receive, party=customer, paid_amount, references.
              </GapTip>
            ),
          },
          { lab: 'Outstanding', val: egp(0), cls: 'pend', gap: true, sub: 'invoiced − paid' },
          { lab: 'Overdue', val: egp(0), cls: 'pend', gap: true, sub: 'aging 0–30 / 31–60 / 61–90 / 90+' },
        ]}
      />

      <div className="note gapn" style={{ margin: '18px 0 4px' }}>
        <b>Four of these seven tiles are placeholders.</b> The PM Phase Cycle Times export carries
        Sales Order quantities and rates only. Contract, delivered and backlog values above are real
        — derived as <span className="mono">qty × (backlog_amount ÷ remaining_qty)</span>. Invoiced,
        paid, outstanding and overdue read zero because no Sales Invoice or Payment Entry rows exist
        in this file. Section 5 of the brief lists exactly which fields the BFF must expose to fill
        them.
      </div>

      <div className="sec">Value by project</div>
      <div className="card scrollx">
        <table className="t">
          <thead>
            <tr>
              <th>Sales order</th>
              <th>Project</th>
              <th className="r">Panels</th>
              <th className="r">Contract</th>
              <th className="r">Delivered</th>
              <th className="r">Backlog</th>
              <th className="r">Invoiced</th>
              <th className="r">Outstanding</th>
              <th>Contractual date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.so}>
                <td>
                  <b>{o.so}</b>
                </td>
                <td>
                  <span className="trunc">{arw(o.proj)}</span>
                </td>
                <td className="r num">
                  {o.deliv} / {o.qty}
                </td>
                <td className="r num">{int(o.contract)}</td>
                <td className="r num">{int(o.dvalue)}</td>
                <td className="r num">{int(o.backlog)}</td>
                <td className="r" style={{ color: 'var(--muted)' }}>
                  —
                </td>
                <td className="r" style={{ color: 'var(--muted)' }}>
                  —
                </td>
                <td>
                  {o.cDate ? fd(o.cDate) : '—'}
                  {o.late ? (
                    <>
                      {' '}
                      <Pill kind="bad">Late</Pill>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#FAFAFA' }}>
              <td colSpan={3}>Total</td>
              <td className="r num">{int(contract)}</td>
              <td className="r num">{int(delivered)}</td>
              <td className="r num">{int(backlog)}</td>
              <td className="r" style={{ color: 'var(--muted)' }}>
                —
              </td>
              <td className="r" style={{ color: 'var(--muted)' }}>
                —
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
