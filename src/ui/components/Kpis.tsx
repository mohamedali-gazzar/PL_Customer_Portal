'use client'

/**
 * The two headline figures: what the work is worth, and how much of it is still
 * outstanding.
 *
 * Two compact cards, sized to their contents. A figure does not become more
 * important by being given more width, and the full-bleed band this replaces gave
 * two numbers the whole page, which read as a hero section rather than a summary.
 *
 * Value first, label beneath — the order the sign-in screen uses for its own
 * figures. Two lines each and nothing else: no meter, no share, no icon. Both
 * cards therefore have exactly the same shape, which is what lets them sit as a
 * balanced pair instead of one qualified block and one plain one.
 *
 * What the figures cover is not repeated here. The filter control sits directly
 * beneath them and already states the year and the number of projects in scope;
 * saying it twice would only compete with the numbers.
 *
 * The exact, unrounded figure is on hover. "EGP 28.31M" is the right thing to read
 * at a glance and the wrong thing to quote in an email, so the full value stays
 * reachable without occupying a line.
 */

import { egp, full } from '../lib/format'
import { useTip, TipHead, TipRow } from '../lib/tooltip'
import { useT } from '../lib/i18n'

export function Kpis({
  contract,
  backlog,
  scope,
}: {
  contract: number
  backlog: number
  /** What the figures cover, e.g. "All projects". Surfaced on hover. */
  scope: string
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
          </>,
        )}
      >
        <div className="kpi-val">{egp(contract)}</div>
        <div className="kpi-lab">{t('kpi.contract')}</div>
      </div>

      <div
        className="kpi"
        {...bind(
          <>
            <TipHead>{t('kpi.backlog')}</TipHead>
            <TipRow label={t('kpi.exact')} value={full(backlog)} />
            <TipRow label={t('kpi.scope')} value={scope} />
          </>,
        )}
      >
        <div className="kpi-val">{egp(backlog)}</div>
        <div className="kpi-lab">{t('kpi.backlog')}</div>
      </div>
    </div>
  )
}
