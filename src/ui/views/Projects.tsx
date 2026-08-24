'use client'

/**
 * Projects: the list, and one project in full.
 *
 * The detail view is where the portal earns its keep — the item table says what
 * every panel is doing, and the timeline above it says how it got there.
 */

import { useMemo } from 'react'
import type { CustomerItem, ScopedSnapshot } from '@/portal/types'
import { STATE } from '@/portal/types'
import { STAGE_NAMES } from '@/portal/constants'
import { deliveryState } from '@/portal/derive'
import { STAGES, stagePosition, visibleStageOf } from '@/portal/milestones'
import { journeyOf, statusKeyOf } from '@/portal/journey'
import { arw, egp, useFd, full, int, Pill } from '../lib/format'
import { useLabel, useT, type MessageKey, type Translate } from '../lib/i18n'
import { byYear, indexItems, itemsOf, orderYears } from '../lib/select'
import { Kpis } from '../components/Kpis'
import { PmContact } from '../components/PmContact'
import { ProjectFilters } from '../components/ProjectFilters'
import { ProjectList } from '../components/ProjectList'

/**
 * Stage and step names, translated by key.
 *
 * The item table has to say the same words as the cards below it, so both go
 * through the model's keys rather than either one holding its own copy.
 */
function useStageWords() {
  const say = useLabel()
  return {
    stageName: (stage: number) => {
      const spec = STAGES[visibleStageOf(stage)]
      return spec ? say(spec.nameKey, spec.name) : ''
    },
    //  arrives already mapped to the portal's English wording; the key comes
    // from the same lookup the cards use, so the two cannot drift.
    stepText: (step: string | null) => (step ? say(statusKeyOf(step), step) : null),
  }
}

export function Projects({
  data,
  so,
  year,
  onYearChange,
  onOpenProject,
  onOpenItem,
  backLabel,
  onBack,
}: {
  data: ScopedSnapshot
  so: string | null
  year: string
  onYearChange: (year: string) => void
  onOpenProject: (so: string | null) => void
  /** Opens one item's own page. */
  onOpenItem?: (id: number) => void
  /** Where the back link goes, named for the list the reader came from. */
  backLabel?: MessageKey
  onBack?: () => void
}) {
  const fd = useFd()
  const t = useT()
  const byId = useMemo(() => indexItems(data.items), [data.items])
  const years = useMemo(() => orderYears(data.orders), [data.orders])
  const shown = useMemo(() => byYear(data.orders, year), [data.orders, year])
  const order = so ? data.orders.find((o) => o.so === so) ?? null : null

  if (order) {
    const items = itemsOf(order, byId)
    return (
      <>
        <div className="crumb">
          <button onClick={() => (onBack ? onBack() : onOpenProject(null))}>
            {t(backLabel ?? 'nav.overview')}
          </button>{' '}
          <span>›</span>{' '}
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
        {/* An index, not a detail view. Each row opens the item's own page — the
            page this one used to try to be for every line at once. */}
        <ItemTable items={items} t={t} today={data.meta.exportDate} selected={null} onOpen={onOpenItem} />
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
          years={years}
          year={year}
          showing={shown.length}
          total={data.orders.length}
          onYearChange={onYearChange}
        />
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <div className="empty">
            {t('filter.noMatch')}{' '}
            <button
              className="linkish"
              onClick={() => onYearChange('all')}
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

/**
 * The whole ladder as a row of marks.
 *
 * One block per stage this item actually shows, filled for done, brand for the one
 * running, empty for the rest. It is the same information as the percentage beside
 * it, but shaped — and a shape can be compared down a column of thirty rows in a
 * way that "30%" and "15%" cannot.
 *
 * The trailing dot is delivery: the end of the road, drawn differently so the row
 * has a visible finish rather than trailing off.
 */
function StageTrack({ item, today }: { item: CustomerItem; today: string }) {
  const t = useT()
  const stages = journeyOf(item, today)
  const done = stages.filter((s) => s.state === 'done').length
  return (
    <span
      className="strack"
      role="img"
      aria-label={t('table.stageTrackAria', { n: done, total: stages.length })}
    >
      {stages.map((st) => (
        <i key={st.n} className={`strack-b ${st.state}`} />
      ))}
      <i className={`strack-end ${stages[stages.length - 1]?.state ?? 'pending'}`} />
    </span>
  )
}

function ItemTable({
  items,
  t,
  today,
  selected,
  onOpen,
}: {
  items: readonly CustomerItem[]
  t: Translate
  today: string
  selected: number | null
  onOpen?: (id: number) => void
}) {
  const { stageName, stepText } = useStageWords()
  return (
    <div className="card scrollx">
      <table className="t">
        <thead>
          <tr>
            {/* An index, so it carries what you need to find a row and nothing
                more. Description repeated the item code in longer words and was the
                column that truncated; work order is factory paperwork and an open
                question for Powerline besides; delivered and contract value are
                per-line detail the item's own page has room to show properly.
                Material went the same way: it read "Not yet available" on most
                rows without saying what was missing or when it lands, and the
                item's own timeline gives the same fact its proper place, against
                the Material Planning stage that owns it. */}
            <th className="lineno">#</th>
            <th>{t('table.item')}</th>
            <th className="r">{t('table.qty')}</th>
            <th>{t('table.currentStage')}</th>
            <th>{t('table.stageTrack')}</th>
            <th className="r">{t('table.progress')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, line) => {
            const found = it.st.findIndex((x) => x[0] === STATE.none || x[0] === STATE.active)
            const cur = found < 0 ? 6 : found
            return (
              /* The row is the control. A separate "view" button in a tenth
                 column would be a second thing to aim at for the only action the
                 row has. */
              <tr
                key={it.id}
                className={it.id === selected ? 'pickable on' : 'pickable'}
                onClick={() => onOpen?.(it.id)}
                tabIndex={0}
                role="button"
                aria-current={it.id === selected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen?.(it.id)
                  }
                }}
              >
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
                <td className="r num">
                  {it.deliv > 0 ? `${it.deliv} / ${it.qty}` : it.qty}
                  {deliveryState(it.deliv, it.qty) === 'partial' ? (
                    <>
                      {' '}
                      <Pill kind="warn">{t('table.partial')}</Pill>
                    </>
                  ) : null}
                </td>
                <td>
                  {`${stagePosition(it.stage, it.rework > 0)}. ${stageName(it.stage)}`}
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>
                    {stepText(it.step) ?? t('table.notStarted')}
                  </span>
                </td>
                {/* Eleven stages as eleven marks. The stage name says where the
                    item is; this says how much of the road is behind it, which is
                    the thing you actually compare between rows — and a shape reads
                    down a column faster than a sentence does. */}
                <td>
                  <StageTrack item={it} today={today} />
                </td>
                <td className="r">
                  <b className="num">{it.pct}%</b>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
