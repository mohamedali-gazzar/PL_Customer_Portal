/**
 * Presentation helpers, ported from the approved prototype.
 *
 * Every one of these decides how a number or a date reads to a customer, so they
 * live together and are used everywhere rather than being re-decided per screen.
 */

import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { useLocale } from './i18n'

/* ------------------------------------------------------------------ text -- */

/** Arabic script, by codepoint range — used to pick the right typeface. */
export const isArabic = (s: string | null | undefined): boolean => /[؀-ۿ]/.test(s ?? '')

/**
 * Render a name in the face that suits its script.
 *
 * Most Powerline customers and projects are named in Arabic, and Poppins has no
 * Arabic coverage. `.ar` switches to Cairo and sets `unicode-bidi: plaintext`, so
 * a mixed Arabic/Latin name reads in the right direction without the surrounding
 * English layout flipping.
 */
export function arw(s: string | null | undefined): ReactNode {
  const v = s ?? ''
  return isArabic(v) ? <span className="ar">{v}</span> : v
}

/** Up to two initials for the avatar; Arabic takes the first two letters. */
export function initials(s: string | null | undefined): string {
  const words = (s ?? '')
    .replace(/[^\p{L}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'C'
  if (isArabic(s)) return words[0]!.slice(0, 2)
  return words
    .slice(0, 2)
    .map((w) => w[0]!)
    .join('')
    .toUpperCase()
}

/* --------------------------------------------------------------- numbers -- */

const nf = new Intl.NumberFormat('en-US')
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const int = (n: number): string => nf.format(Math.round(n))

/**
 * Compact money.
 *
 * Contract values here run to hundreds of millions of pounds; printed in full
 * they stop being readable and start being counted. Two significant decimals keep
 * "3.39M" honest at a glance, and the exact figure is always a hover away.
 */
export function short(n: number | null | undefined): string {
  const v = n ?? 0
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}K`
  return nf.format(Math.round(v))
}

/**
 * Money, with its currency.
 *
 * Brief §5: always show the document's own currency and never convert. The
 * currency rides with the amount so the two cannot be separated by a layout change.
 */
export const egp = (n: number | null | undefined): ReactNode => (
  <>
    <span className="cur">EGP</span>
    {short(n)}
  </>
)

export const full = (n: number | null | undefined): string => `EGP ${nf2.format(n ?? 0)}`

/* ----------------------------------------------------------------- dates -- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse a plain calendar day. UTC throughout, so no date shifts by a timezone. */
export function D(s: string | null | undefined): Date | null {
  if (!s) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) ? null : new Date(t)
}

/** Arabic month names, in the Gregorian order the export uses. */
const MON_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

/**
 * "9 Apr 25" — short enough for a timeline tick, unambiguous about the year.
 *
 * The month is a word and follows the reader's language; the day and year are
 * numerals and stay Latin in both, because every date on these screens sits beside
 * a sales order number or a day count the customer may quote back.
 */
export function fd(s: string | null | undefined, locale: 'en' | 'ar' = 'en'): string {
  const d = D(s)
  if (!d) return '—'
  const month = locale === 'ar' ? MON_AR[d.getUTCMonth()] : MON[d.getUTCMonth()]
  return `${d.getUTCDate()} ${month} ${String(d.getUTCFullYear()).slice(2)}`
}

/**
 * `fd` bound to the reader's language.
 *
 * A hook rather than a locale argument at each of the thirty-odd call sites: the
 * date format is a property of who is reading, not of the individual date, and
 * threading it by hand is how one tick ends up in the wrong language.
 */
export function useFd(): (s: string | null | undefined) => string {
  const locale = useLocale()
  return useCallback((x: string | null | undefined) => fd(x, locale), [locale])
}

export function days(a: string | null | undefined, b: string | null | undefined): number {
  const x = D(a)
  const y = D(b)
  if (!x || !y) return 0
  return Math.round((y.getTime() - x.getTime()) / 86_400_000)
}

/** Plural that reads naturally: "1 order", "2 orders". */
export const s = (n: number): string => (n === 1 ? '' : 's')

/* ----------------------------------------------------------------- icons -- */

export type PillKind = 'ok' | 'warn' | 'bad' | 'info' | 'gap'

export const ICO: Record<PillKind, ReactNode> = {
  ok: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M8 2.4L15 14H1L8 2.4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 6.6v3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.7" r=".95" fill="currentColor" />
    </svg>
  ),
  bad: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 4.6v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r=".95" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7.4v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r=".95" fill="currentColor" />
    </svg>
  ),
  /** A dashed outline: this is an absence, not a failure. */
  gap: (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 2.2" />
    </svg>
  ),
}

export function Pill({ kind, children }: { kind: PillKind; children: ReactNode }) {
  return (
    <span className={`pill ${kind}`}>
      {ICO[kind]}
      {children}
    </span>
  )
}
