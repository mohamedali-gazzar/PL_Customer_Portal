export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export type Direction = 'ltr' | 'rtl'

export function direction(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar'
}

/**
 * Latin digits in both locales.
 *
 * Arabic-Indic digits would be more idiomatic for prose, but every number on this
 * portal sits next to an identifier the customer may need to quote back to us — a
 * sales order number, an invoice reference, a day count in an email. Mixing numeral
 * systems in that context costs more than it gains. Revisit if the business asks.
 */
const NUMBERING = 'latn'

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let cached = dateFormatters.get(key)
  if (cached === undefined) {
    const tag = locale === 'ar' ? 'ar-EG' : 'en-GB'
    cached = new Intl.DateTimeFormat(`${tag}-u-nu-${NUMBERING}`, { timeZone: 'UTC', ...options })
    dateFormatters.set(key, cached)
  }
  return cached
}

/** `2026-08-17` → "17 Aug 2026" / "١٧ أغسطس ٢٠٢٦"-with-Latin-digits. */
export function formatDate(locale: Locale, isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return isoDate
  return formatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

export function formatMonth(locale: Locale, isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return isoDate
  return formatter(locale, { month: 'short' }).format(parsed)
}

export function formatMonthYear(locale: Locale, isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return isoDate
  return formatter(locale, { month: 'short', year: '2-digit' }).format(parsed)
}

export function formatNumber(locale: Locale, value: number): string {
  const tag = locale === 'ar' ? 'ar-EG' : 'en-GB'
  return new Intl.NumberFormat(`${tag}-u-nu-${NUMBERING}`, { maximumFractionDigits: 1 }).format(value)
}
