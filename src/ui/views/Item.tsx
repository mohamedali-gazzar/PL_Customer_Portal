'use client'

/**
 * One panel, on its own page.
 *
 * The project page used to answer "where is my order" and "where is this panel"
 * in the same scroll, and the second question lost — every line's stage strip and
 * bar printed one after another, so finding a panel meant scrolling past the
 * others. This is the second question given its own page.
 *
 * The layout follows the approved mockup: the identity and the four numbers that
 * matter in a dark block at the top, the milestones read top-to-bottom beside a
 * rail, and a column on the right for the things that are about the item without
 * being part of its history — what it is waiting on, its facts, who to call.
 *
 * The milestones run vertically here, where the project page runs them across.
 * A page devoted to one item has the height for it, and a vertical rail shows all
 * eleven stages at once where the horizontal strip shows three and scrolls. The
 * timeline bar underneath is unchanged, and stays: it is the only view that shows
 * how long each stage actually took.
 */

import { AWAITING_APPROVAL_STAGE, stagesFor } from '@/portal/milestones'
import { journeyOf, materialKeyOf, type JourneyStage } from '@/portal/journey'
import type { CustomerItem, CustomerOrder, ScopedSnapshot } from '@/portal/types'
import { contractLine } from '../components/Timeline'
import { useLabel, useT } from '../lib/i18n'
import { arw, days, ICO, useFd } from '../lib/format'

export function Item({
  data,
  order,
  item,
  onBack,
}: {
  data: ScopedSnapshot
  order: CustomerOrder
  item: CustomerItem
  onBack: () => void
}) {
  const t = useT()
  const lbl = useLabel()
  const fd = useFd()
  const today = data.meta.exportDate

  const stages = journeyOf(item, today)
  const cleared = stages.filter((s) => s.state === 'done').length
  const current = stages.find((s) => s.state === 'active') ?? null
  /* Read from the cards, not from `item.stage`.
     The report's stage number and v8's per-card rule can disagree — a card whose
     end date is stamped reads done even while the ladder still points at it — and
     taking the headline from one while the timeline below takes it from the other
     put "Your approval" above a card marked Completed. */
  const withYou =
    stages.find((s) => s.n === AWAITING_APPROVAL_STAGE)?.state === 'active'

  return (
    <>
      <div className="crumb">
        <button onClick={onBack}>{arw(order.proj)}</button> <span>›</span>{' '}
        <span>{item.code}</span>
      </div>

      {/* The identity block. Dark, because it is the one part of the page that is
          about the panel rather than about its progress, and the contrast keeps
          the timeline below reading as the body. */}
      <div className="ihero">
        <div className="ihero-top">
          <div className="ihero-id">
            <div className="mono ihero-ref">
              {item.code} · {order.so}
            </div>
            <h1 className="ihero-h">{arw(item.name ?? item.code)}</h1>
            <p className="ihero-sub">
              {[item.grp, arw(order.proj)].filter(Boolean).join(' · ')}
            </p>
          </div>

          {withYou ? (
            <div className="ihero-tag">
              <span className="ihero-pill">{t('item.yourApproval')}</span>
              <p>{t('item.withYouLine')}</p>
            </div>
          ) : current ? (
            <div className="ihero-tag">
              <span className="ihero-pill neutral">{lbl(current.labelKey, current.label)}</span>
              <p>{current.what}</p>
            </div>
          ) : null}
        </div>

        <div className="ihero-stats">
          <Stat label={t('item.quantity')} value={String(item.qty)} />
          <Stat
            label={t('item.daysInStageLab')}
            value={item.dis !== null ? `${item.dis}d` : '—'}
            hot={withYou}
          />
          <Stat label={t('item.stageSince')} value={item.since ? fd(item.since) : '—'} mono />
          <Stat
            label={t('item.stagesCleared')}
            value={`${cleared}`}
            suffix={` / ${stagesFor(item.rework > 0).length}`}
          />
        </div>
      </div>

      {item.hold ? (
        <div className="hold-note">
          {ICO.warn} <span>{t('table.onHoldBanner')}</span>
        </div>
      ) : null}

      {/* Milestones, top to bottom. */}
      <div className="card iprog">
        <div className="iprog-h">
          <span>{t('item.progress')}</span>
          {/* Portal-calculated, not an ERP field: neither export carries a progress
              column, so this is the specification's per-stage weights applied to
              `Current Stage #`. It reads as a summary of the list below it, which
              is where it belongs — beside the thing it summarises. */}
          <span className="iprog-pct">
            <i className="prog" aria-hidden>
              <i style={{ width: `${item.pct}%` }} />
            </i>
            <b>{item.pct}%</b>
          </span>
        </div>
        <ol className="vt">
          {stages.map((st) => (
            <VStage key={st.n} st={st} today={today} />
          ))}
        </ol>
        {/* What the whole sequence is measured against. It sat under the bar
            before; with the bar gone it belongs at the foot of the sequence it
            describes rather than nowhere. */}
        <p className="iprog-foot">{contractLine(item, today, t, fd)}</p>
      </div>


    </>
  )
}

function Stat({
  label,
  value,
  suffix,
  hot,
  mono,
}: {
  label: string
  value: string
  suffix?: string
  hot?: boolean
  mono?: boolean
}) {
  return (
    <div className="istat">
      <span className="istat-l">{label}</span>
      <span className={`istat-v${hot ? ' hot' : ''}${mono ? ' mono' : ''}`}>
        {value}
        {suffix ? <em>{suffix}</em> : null}
      </span>
    </div>
  )
}

/** One stage on the vertical rail: the dot, the heading, and its steps. */
function VStage({ st, today }: { st: JourneyStage; today: string }) {
  const t = useT()
  const lbl = useLabel()
  const fd = useFd()

  const state = st.state === 'done' ? 'done' : st.state === 'active' ? 'act' : 'pend'
  const tag =
    st.state === 'done'
      ? t('item.completed')
      : st.state === 'active'
        ? t('item.inProgress')
        : t('item.notStarted')

  return (
    <li className={`vt-s ${state}`}>
      <span className="vt-dot" aria-hidden />
      <div className="vt-b">
        <div className="vt-h">
          <span className="vt-n mono">{t('item.stageN', { n: st.n })}</span>
          <span className="vt-name">{lbl(st.labelKey, st.label)}</span>
          <span className="vt-tag">{tag}</span>
          <span className="vt-team mono">· {lbl(st.teamKey, st.team)}</span>
        </div>

        {st.what ? <p className="vt-what">{st.what}</p> : null}

        {/* The date this stage is measured against, where the report carries one:
            the promised material delivery, the planned end of production, the
            contractual date. These were markers under the bar. */}
        {st.planned ? (
          <p className="vt-plan">
            {t('item.target')} <b>{fd(st.planned)}</b>
          </p>
        ) : null}

        {st.alongside !== undefined ? (
          <p className="vt-par">{t('stage.parallelWhy')}</p>
        ) : null}

        {st.unrecorded ? (
          <p className="vt-what idle">{t('now.noProduction')}</p>
        ) : (
          <div className="vt-steps">
            {st.steps.map((sp) => {
              const running = sp.state === 'active' && !sp.done
              return (
              /* `sp.done`, not `sp.state`, for the marker.
                 A step's state comes from its own two dates; a stage the ladder has
                 already passed is done whether or not those dates were ever
                 stamped. Reading only the dates put "Not started" inside a card
                 headed COMPLETED. `done` is the flag that knows about both. */
              <div
                className={`vt-step ${sp.done ? 'done' : sp.state === 'active' ? 'run' : 'pend'}`}
                key={`${sp.no}-${sp.label}`}
              >
                <span className="vt-step-l">
                  {lbl(sp.labelKey, sp.label)}
                  {/* What the check found, not just that it happened — the material
                      status the stage cards carried beside this step. */}
                  {sp.note ? (
                    <em className="vt-step-note">{lbl(materialKeyOf(sp.note), sp.note)}</em>
                  ) : null}
                </span>
                {/* Four cases, and the distinction between the last two is the
                    one that matters: a step still running measures to today, a
                    step that finished without a stamp measures nothing at all.
                    Treating them the same claimed 566 days of "ongoing" work
                    inside a stage marked Completed. */}
                <span className="vt-step-d mono">
                  {sp.ended ? (
                    <>
                      {fd(sp.started ?? sp.ended)} <i>→</i> {fd(sp.ended)}
                    </>
                  ) : sp.started && running ? (
                    <>
                      {fd(sp.started)} <i>→</i> {t('item.ongoing')}
                    </>
                  ) : sp.started ? (
                    <>
                      {fd(sp.started)} <i>→</i> {t('now.notRecorded')}
                    </>
                  ) : sp.done ? (
                    t('now.notRecorded')
                  ) : (
                    t('item.notStarted')
                  )}
                </span>
                <span className={`vt-step-n mono${running ? ' hot' : ''}`}>
                  {sp.ended && sp.started
                    ? `${days(sp.started, sp.ended)}d`
                    : sp.started && running
                      ? `${days(sp.started, today)}d`
                      : ''}
                </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </li>
  )
}
