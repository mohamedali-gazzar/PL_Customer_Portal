'use client'

/**
 * Documents.
 *
 * What exists today is the record of which documents *should* exist: every work
 * order is the attachment point for a FAT report. The files themselves need the
 * ERPNext File doctype, and — per brief §8.2 — a decision about where the
 * customer-facing FAT PDF lives.
 *
 * When they arrive they will stream through the BFF behind a permission check, on
 * short-lived signed URLs. An ERPNext private file URL must never reach a browser.
 */

import { useMemo } from 'react'
import type { ScopedSnapshot } from '@/portal/types'
import { STATE } from '@/portal/types'
import { arw, fd, Pill } from '../lib/format'
import { indexItems, itemsOf } from '../lib/select'
import { GapTip, Tiles } from '../components/Tiles'

export function Documents({ data }: { data: ScopedSnapshot }) {
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const withWorkOrder = data.items.filter((i) => i.wo)
  const released = data.orders.filter((o) =>
    itemsOf(o, byId).some((i) => i.st[0]![0] === STATE.done),
  ).length

  return (
    <>
      <div className="pgh">
        <div>
          <h1 className="pt">Documents</h1>
          <p className="psub">
            Document records referenced by your orders. Files stream through the BFF with permission
            checks — ERPNext file URLs are never exposed.
          </p>
        </div>
      </div>

      <Tiles
        tiles={[
          {
            lab: 'Work order records',
            val: String(withWorkOrder.length),
            sub: 'FAT report attachment point',
          },
          {
            lab: 'Orders with drawings released',
            val: `${released} / ${data.orders.length}`,
            sub: 'released RFD exists',
          },
          {
            lab: 'FAT reports',
            val: '0',
            cls: 'pend',
            gap: true,
            sub: 'awaiting File doctype feed',
            tip: (
              <GapTip>
                Needs File ? attached_to_doctype=Work Order. Brief §8.2: agree one home for the FAT
                PDF.
              </GapTip>
            ),
          },
          { lab: 'Delivery notes', val: '0', cls: 'pend', gap: true, sub: 'awaiting Delivery Note feed' },
          { lab: 'Invoices', val: '0', cls: 'pend', gap: true, sub: 'awaiting Sales Invoice feed' },
        ]}
      />

      <div className="sec">Document records available from this export</div>
      <div className="card scrollx">
        {withWorkOrder.length === 0 ? (
          <div className="empty">No work orders raised on your orders yet.</div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Project</th>
                <th>Item</th>
                <th>Stage evidence</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {withWorkOrder.map((i) => {
                const releasedOn = i.st[0]![3]
                return (
                  <tr key={i.id}>
                    <td className="mono">
                      <b>{i.wo}</b>
                    </td>
                    <td>Work Order</td>
                    <td>
                      <span className="trunc">{arw(i.proj)}</span>
                    </td>
                    <td>{i.code}</td>
                    <td>
                      {i.woStatus ?? '—'}
                      {releasedOn ? ` · drawings released ${fd(releasedOn)}` : ''}
                    </td>
                    <td>
                      <Pill kind="gap">No attachment in export</Pill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
