import type { ReactNode } from 'react'
import type { DashboardProjectCardDto } from '@/dto/dashboard'
import type { MaybeDto, ScheduleDto } from '@/dto/common'
import { formatDate, type Locale } from '@/ui/i18n/locale'
import { pluralizer, type MessageKey, type Translate } from '@/ui/i18n/messages'
import { Badge, Progress, Value, type Tone } from './primitives'
import s from './project-card.module.css'

export function ProjectGrid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>
}

export function ProjectCard({
  card,
  locale,
  t,
}: {
  card: DashboardProjectCardDto
  locale: Locale
  t: Translate
}) {
  const href = `/${locale}/projects/${encodeURIComponent(card.id)}`
  const tp = pluralizer(locale)

  return (
    <article className={s.card}>
      <div className={s.top}>
        <a className={s.titleLink} href={href}>
          <h3 className={s.title}>
            <bdi>{card.displayName}</bdi>
          </h3>
          <div className={s.meta}>
            <span className="ltr-num">{card.salesOrderNo}</span>
            <span className={s.metaSep}>·</span>
            {t('project.projectManager')}: <Value value={card.projectManager} t={t} />
          </div>
        </a>
        <div className={s.badges}>
          <ScheduleBadge schedule={card.schedule} locale={locale} t={t} />
        </div>
      </div>

      <Progress progress={card.progress} t={t} tp={tp} />

      {card.attention.awaitingCustomer > 0 && (
        <div className={s.action}>
          <svg className={s.actionIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2.75l7 12.5H3l7-12.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M10 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13" r="0.9" fill="currentColor" />
          </svg>
          <span>
            <span className={s.actionStrong}>
              {tp('attention.awaitingYourApproval', card.attention.awaitingCustomer)}
            </span>
            {card.blockedExample.known && card.blockedExample.value.sinceDays.known && (
              <span className={s.actionSince}>
                {tp('attention.awaitingSince', card.blockedExample.value.sinceDays.value)}
              </span>
            )}
          </span>
        </div>
      )}

      {card.nextMilestone.known && (
        <div className={s.next}>
          <span className={s.nextLabel}>{t('project.nextMilestone')}</span>
          <span className={s.nextValue}>
            {t(`stage.${card.nextMilestone.value.stage}` as MessageKey)}
          </span>
          <span className={s.nextDate}>
            {card.nextMilestone.value.plannedOn.known ? (
              formatDate(locale, card.nextMilestone.value.plannedOn.value)
            ) : (
              <Value value={card.nextMilestone.value.plannedOn} t={t} />
            )}
          </span>
        </div>
      )}

      <div className={s.footRow}>
        <div className={s.footFacts}>
          <span className={s.fact}>
            <span className={s.factLabel}>{t('project.items')}</span>
            <span className={s.factValue}>{card.itemCount}</span>
          </span>
          <span className={s.fact}>
            <span className={s.factLabel}>{t('project.contractualDate')}</span>
            <span className={s.factValue}>
              <Value value={card.contractualDate} t={t} render={(v) => formatDate(locale, String(v))} />
            </span>
          </span>
          <span className={s.fact}>
            <span className={s.factLabel}>{t('project.poNumber')}</span>
            <span className={s.factValue}>
              <Value value={card.customerPoNo} t={t} />
            </span>
          </span>
        </div>
      </div>
    </article>
  )
}

/**
 * Schedule badge.
 *
 * Wording is deliberately about the calendar, never about delivery: this source
 * cannot observe whether an item has shipped, so "past contractual date" is the
 * strongest claim available. "Late" or "overdue delivery" would not be supportable.
 */
export function ScheduleBadge({
  schedule,
  locale,
  t,
}: {
  schedule: MaybeDto<ScheduleDto>
  locale: Locale
  t: Translate
}) {
  if (!schedule.known) {
    return <Badge tone="void">{t('unknown.not_in_source')}</Badge>
  }
  const tp = pluralizer(locale)
  const { state, daysToContractual } = schedule.value
  const tone: Tone = state === 'past_contractual_date' ? 'danger' : state === 'due_soon' ? 'warn' : 'ok'
  const detail =
    daysToContractual === 0
      ? t('schedule.dueToday')
      : daysToContractual > 0
        ? tp('schedule.daysRemaining', daysToContractual)
        : tp('schedule.daysOverdue', Math.abs(daysToContractual))

  return (
    <Badge tone={tone} dot>
      <span title={formatDate(locale, schedule.value.contractualDate)}>
        {t(`schedule.${state}` as MessageKey)} · {detail}
      </span>
    </Badge>
  )
}
