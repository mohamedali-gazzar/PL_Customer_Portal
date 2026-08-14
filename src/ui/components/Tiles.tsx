'use client'

/**
 * The row of headline figures at the top of a screen.
 *
 * One tile type carries four meanings, by class rather than by shape, so the row
 * stays a row:
 *   (default)  a plain figure
 *   .good      money that has actually arrived
 *   .crit      something that needs attention
 *   .pend      hatched — *not available*, which is not the same as zero
 *
 * The hatched state is the important one. A portal that renders an unknown balance
 * as "EGP 0" has told the customer something false. Hatching plus a dashed-square
 * icon plus a tooltip naming the missing document type tells them the truth.
 */

import type { ReactNode } from 'react'
import { ICO } from '../lib/format'
import { useTip, TipHead, TipNote } from '../lib/tooltip'

export interface TileSpec {
  readonly lab: string
  readonly val: ReactNode
  readonly sub?: ReactNode
  readonly cls?: 'good' | 'crit' | 'pend' | ''
  /** Marks the figure as unavailable rather than zero. */
  readonly gap?: boolean
  /** What is missing, and what would fill it. */
  readonly tip?: ReactNode
}

export function Tiles({ tiles }: { tiles: readonly TileSpec[] }) {
  return (
    <div className="tiles">
      {tiles.map((t, i) => (
        <Tile key={t.lab} spec={t} index={i} />
      ))}
    </div>
  )
}

function Tile({ spec, index }: { spec: TileSpec; index: number }) {
  const bind = useTip()
  const handlers = spec.tip ? bind(spec.tip) : {}
  return (
    <div
      className={`tile ${spec.cls ?? ''}`.trim()}
      style={{ animationDelay: `${index * 55}ms` }}
      {...handlers}
    >
      <div className="lab">
        {spec.lab}
        {spec.gap ? <> {ICO.gap}</> : null}
      </div>
      <div className="val num">{spec.val}</div>
      {spec.sub !== undefined ? <div className="sub">{spec.sub}</div> : null}
    </div>
  )
}

/** The standard tooltip for a figure this data source cannot supply. */
export function GapTip({ children }: { children: ReactNode }) {
  return (
    <>
      <TipHead>
        {ICO.gap} Not in this export
      </TipHead>
      <TipNote>{children}</TipNote>
    </>
  )
}
