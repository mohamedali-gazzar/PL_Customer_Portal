import type { ReactNode } from 'react'
import type { MaybeDto, UnavailabilityDto, UnavailabilityCode, ProgressDto, StageIdDto } from '@/dto/common'
import type { MessageKey, Translate, TranslatePlural } from '@/ui/i18n/messages'
import { cn } from '@/ui/cn'
import { formatStageRange } from './stage-state'
import s from './primitives.module.css'

/* ── Layout ─────────────────────────────────────────────────────────── */

export function Page({ children }: { children: ReactNode }) {
  return <div className={s.page}>{children}</div>
}

export function PageHead({ title, sub, aside }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {sub !== undefined && <div className={s.pageSub}>{sub}</div>}
      </div>
      {aside}
    </div>
  )
}

export function SectionHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className={s.sectionHead}>
      <h2 className={s.sectionTitle}>{title}</h2>
      {aside}
    </div>
  )
}

export function Card({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return <div className={pad ? cn(s.card, s.cardPad) : cn(s.card)}>{children}</div>
}

export function DefGrid({ children }: { children: ReactNode }) {
  return <dl className={s.defGrid}>{children}</dl>
}

/* ── Values, known and not ──────────────────────────────────────────── */

/**
 * The field-level missing-data treatment.
 *
 * A `MaybeDto` renders either its value or a dash plus the reason it is absent. The
 * `reason` comes straight from the domain, so the wording follows the data rather
 * than a component's guess — and there is no code path here that could render an
 * unknown as an empty string or a zero.
 */
export function Value({
  value,
  t,
  render,
}: {
  value: MaybeDto<string | number>
  t: Translate
  render?: (v: string | number) => ReactNode
}) {
  if (value.known) return <>{render ? render(value.value) : value.value}</>
  return (
    <span className={s.unknown}>
      <span className={s.unknownDash} aria-hidden="true">
        {t('unknown.short')}
      </span>
      <span className={s.unknownReason}>{t(`unknown.${value.reason}` as MessageKey)}</span>
    </span>
  )
}

export function Field({
  label,
  value,
  t,
  render,
}: {
  label: ReactNode
  value: MaybeDto<string | number>
  t: Translate
  render?: (v: string | number) => ReactNode
}) {
  return (
    <div className={s.field}>
      <dt className={s.fieldLabel}>{label}</dt>
      <dd className={s.fieldValue}>
        <Value value={value} t={t} render={render} />
      </dd>
    </div>
  )
}

/* ── KPI tile ───────────────────────────────────────────────────────── */

export function TileRow({ children }: { children: ReactNode }) {
  return <div className={s.tileRow}>{children}</div>
}

export function Tile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'attention' | 'void'
}) {
  const valueClass = cn(
    s.tileValue,
    tone === 'attention' && s.tileValueAttention,
    tone === 'void' && s.tileValueVoid,
  )
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={valueClass}>{value}</span>
      {hint !== undefined && <span className={s.tileHint}>{hint}</span>}
    </div>
  )
}

/** A tile whose figure this source cannot supply. Shows the reason, never a zero. */
export function VoidTile({ label, t }: { label: ReactNode; t: Translate }) {
  return <Tile label={label} value={t('unknown.not_in_source')} tone="void" />
}

/* ── Badge ──────────────────────────────────────────────────────────── */

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'void'

const TONE_CLASS: Record<Tone, string | undefined> = {
  neutral: s.badgeNeutral,
  ok: s.badgeOk,
  warn: s.badgeWarn,
  danger: s.badgeDanger,
  accent: s.badgeAccent,
  void: s.badgeVoid,
}

export function Badge({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cn(s.badge, TONE_CLASS[tone])}>
      {dot === true && <span className={s.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}

/* ── Progress ───────────────────────────────────────────────────────── */

/**
 * Progress, always with its basis.
 *
 * The percentage is never shown alone. `progressBasis` travels from the domain to
 * here specifically so this component can render "97% of stages 1–3" — a bare "97%
 * complete" would imply a passed factory test, a cleared payment and a delivered
 * panel, none of which this source can see.
 */
export function Progress({
  progress,
  t,
  tp,
  showNote = false,
}: {
  progress: ProgressDto
  t: Translate
  tp: TranslatePlural
  showNote?: boolean
}) {
  const stages = formatStageRange(progress.basis)
  const excluded = progress.linesTotal - progress.linesCounted

  if (!progress.percent.known) {
    return (
      <div className={s.progress}>
        <div className={s.progressTop}>
          <span className={s.progressValue}>
            <Value value={progress.percent} t={t} />
          </span>
        </div>
        <div className={s.progressTrack} />
      </div>
    )
  }

  const percent = progress.percent.value
  return (
    <div className={s.progress}>
      <div className={s.progressTop}>
        <span className={s.progressValue}>{t('progress.ofStages', { percent, stages })}</span>
        {excluded > 0 && (
          <span className={s.progressBasis}>
            {t('progress.linesCounted', { counted: progress.linesCounted, total: progress.linesTotal })}
          </span>
        )}
      </div>
      <div
        className={s.progressTrack}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('a11y.progressOf', { percent })}
      >
        <div className={s.progressFill} style={{ width: `${percent}%` }} />
      </div>
      {showNote && <p className={s.progressNote}>{t('progress.basisNote', { stages })}</p>}
      {showNote && excluded > 0 && (
        <p className={s.progressNote}>{tp('progress.linesExcluded', excluded, { excluded })}</p>
      )}
    </div>
  )
}


/* ── Unavailability ─────────────────────────────────────────────────── */

/**
 * The section-level missing-data panel.
 *
 * Rendered from a declared `UnavailabilityDto`, never from an empty array or a
 * caught error — so a backend outage can never be presented to a customer as "you
 * have no invoices".
 */
export function Unavailable({
  info,
  t,
  sourceLabel,
  compact = false,
}: {
  info: UnavailabilityDto
  t: Translate
  sourceLabel?: string
  compact?: boolean
}) {
  return (
    <section className={cn(s.void, compact && s.voidCompact)} aria-live="polite">
      <svg className={s.voidIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7.75v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
      <div>
        <h3 className={s.voidTitle}>{t(`${info.code}.title` as MessageKey)}</h3>
        <p className={s.voidBody}>{t(`${info.code}.body` as MessageKey)}</p>
        {sourceLabel !== undefined && <p className={s.voidSource}>{sourceLabel}</p>}
      </div>
    </section>
  )
}

export function unavailabilityOf(code: UnavailabilityCode, scope: UnavailabilityDto['scope']): UnavailabilityDto {
  return { code, scope }
}

/* ── Breadcrumb ─────────────────────────────────────────────────────── */

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className={s.crumbs} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 && (
            <span className={s.crumbSep} aria-hidden="true">
              {'›'}
            </span>
          )}{' '}
          {item.href === undefined ? (
            <span className={s.crumbCurrent}>{item.label}</span>
          ) : (
            <a className={s.crumbLink} href={item.href}>
              {item.label}
            </a>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ── Empty state ────────────────────────────────────────────────────── */

export function EmptyState({ title, body }: { title: ReactNode; body: ReactNode }) {
  return (
    <div className={s.empty}>
      <h2 className={s.emptyTitle}>{title}</h2>
      <p className={s.emptyBody}>{body}</p>
    </div>
  )
}

/* ── View toggle (links, so it needs no client JavaScript) ──────────── */

export function ViewToggle({
  items,
  label,
}: {
  items: { label: string; href: string; active: boolean }[]
  label: string
}) {
  return (
    <div className={s.toggle} role="group" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(s.toggleItem, item.active && s.toggleItemActive)}
          aria-current={item.active ? 'true' : undefined}
        >
          {item.label}
        </a>
      ))}
    </div>
  )
}

export function LinkButton({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) {
  return (
    <a href={href} className={cn(s.button, ghost === true && s.buttonGhost)}>
      {children}
    </a>
  )
}

export const styles = s

export { formatStageRange } from './stage-state'
