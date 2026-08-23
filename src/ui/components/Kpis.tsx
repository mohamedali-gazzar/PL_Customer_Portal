'use client'

/**
 * The headline figures: what the work is worth, how much is outstanding, how much
 * has shipped, and how much is sitting with the customer.
 *
 * Compact cards sized to their contents. A figure does not become more important
 * by being given more width, and the full-bleed band this replaces gave two
 * numbers the whole page, which read as a hero section rather than a summary.
 *
 * Label above the figure, following the reference mockup. The previous order —
 * figure first — came from the sign-in screen, where a single number is decoration
 * and reads before its caption. Four cards is a different problem: they answer
 * four different questions, and a reader scanning the row needs the question
 * before the answer or they re-read every card to find the one they wanted.
 *
 * The label is set as a mono micro-label so it stops competing with the numeral.
 * That is what lets the figure carry the card without needing more size than the
 * layout can spare.
 *
 * What the figures cover is not repeated here. The filter control sits directly
 * beneath them and already states the year and the number of projects in scope;
 * saying it twice would only compete with the numbers.
 *
 * The exact, unrounded figure is on hover. "EGP 28.31M" is the right thing to read
 * at a glance and the wrong thing to quote in an email, so the full value stays
 * reachable without occupying a line.
 */

import type { ReactNode } from 'react'

import { egp, full, int } from '../lib/format'
import { useTip, TipHead, TipNote, TipRow } from '../lib/tooltip'
import { useT } from '../lib/i18n'

export function Kpis({
  contract,
  backlog,
  scope,
  contractNote,
  backlogNote,
  delivered,
  awaiting,
}: {
  contract: number
  backlog: number
  /**
   * What the figures cover, e.g. "All projects" or one project's name. Surfaced on
   * hover. A node rather than a string so an Arabic name arrives already isolated
   * for bidi, which a name sitting beside Latin punctuation needs.
   */
  scope: ReactNode
  /**
   * Optional extra detail for the hover panel — on one project, how many panels
   * each figure covers. A label and a value rather than a sentence, so the count
   * sits beside its noun instead of inside it.
   */
  contractNote?: { label: string; value: string }
  backlogNote?: { label: string; value: string }
  /**
   * The dashboard's two further figures. Absent on a project page, where the
   * question is about one order rather than the portfolio.
   *
   * `delivered` is money already shipped; `awaiting` is a count of panels, not a
   * value, because the useful fact about work sitting with the customer is how
   * many pieces it is holding up.
   */
  delivered?: number
  awaiting?: number
}) {
  const bind = useTip()
  const t = useT()

  return (
    <div className="kpis">
      <div
        className="kpi"
        {...bind(
          <>
            <TipHead>{t('kpi.contract')}</TipHead>
            <TipRow label={t('kpi.exact')} value={full(contract)} />
            <TipRow label={t('kpi.scope')} value={scope} />
            {contractNote ? <TipRow label={contractNote.label} value={contractNote.value} /> : null}
          </>,
        )}
      >
        <div className="kpi-lab">{t('kpi.contract')}</div>
        <div className="kpi-val">{egp(contract)}</div>
      </div>

      <div
        className="kpi"
        {...bind(
          <>
            <TipHead>{t('kpi.backlog')}</TipHead>
            <TipRow label={t('kpi.exact')} value={full(backlog)} />
            <TipRow label={t('kpi.scope')} value={scope} />
            {backlogNote ? <TipRow label={backlogNote.label} value={backlogNote.value} /> : null}
          </>,
        )}
      >
        <div className="kpi-lab">{t('kpi.backlog')}</div>
        <div className="kpi-val">{egp(backlog)}</div>
      </div>

      {delivered !== undefined ? (
        <div
          className="kpi"
          {...bind(
            <>
              <TipHead>{t('kpi.delivered')}</TipHead>
              <TipRow label={t('kpi.exact')} value={full(delivered)} />
              <TipRow label={t('kpi.scope')} value={scope} />
            </>,
          )}
        >
          <div className="kpi-lab">{t('kpi.delivered')}</div>
          <div className="kpi-val">{egp(delivered)}</div>
        </div>
      ) : null}

      {awaiting !== undefined ? (
        <div
          className={awaiting > 0 ? 'kpi kpi-you' : 'kpi'}
          {...bind(
            <>
              <TipHead>{t('kpi.awaiting')}</TipHead>
              <TipRow label={t('kpi.scope')} value={scope} />
              <TipNote>{t('kpi.awaitingWhy')}</TipNote>
            </>,
          )}
        >
          {/* A count, not a currency: these are panels, and the figure is only
              actionable because it is the one number the customer can change.
              It is also the one figure that does not say its own unit — "3" beside
              three money totals needs the caption to be read correctly. */}
          <div className="kpi-lab">{t('kpi.awaiting')}</div>
          <div className="kpi-val num">{int(awaiting)}</div>
          <div className="kpi-cap">{t('kpi.awaitingUnit')}</div>
        </div>
      ) : null}
    </div>
  )
}
