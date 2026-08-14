/**
 * Calendar dates without time or timezone.
 *
 * Everything the portal shows is a *calendar* fact: a drawing was submitted on
 * a day, a work order closed on a day, a contractual date falls on a day. Using
 * `Date` for these invites off-by-one-day bugs the moment a server runs in a
 * different timezone from Cairo, and every milestone variance in the portal is
 * measured in days — so a one-day slip is a visible, wrong number.
 *
 * `PlainDate` is a branded `YYYY-MM-DD` string. All arithmetic goes through UTC
 * midnight, which is exact for day differences.
 */

declare const PlainDateBrand: unique symbol
export type PlainDate = string & { readonly [PlainDateBrand]: true }

const PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Shape *and* calendar validity.
 *
 * The pattern alone would accept 2026-02-30 and 2026-04-31. Letting one through
 * would silently shift the day when it was next round-tripped through a Date,
 * putting a milestone on the wrong date.
 */
export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'string') return false
  const match = PATTERN.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return day <= daysInMonth(year, month)
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function plainDate(value: string): PlainDate {
  if (!isPlainDate(value)) {
    throw new TypeError(`Not a valid YYYY-MM-DD calendar date: ${JSON.stringify(value)}`)
  }
  return value
}

export function tryPlainDate(value: unknown): PlainDate | null {
  return isPlainDate(value) ? value : null
}

/**
 * Read the calendar date out of a `Date` using its UTC fields.
 *
 * Excel serial dates carry no timezone; exceljs materialises them as UTC
 * midnight. Reading them with local getters would shift the day backwards for
 * anyone west of UTC, so UTC getters are the correct — not merely convenient —
 * choice here.
 */
export function fromUtcDate(date: Date): PlainDate {
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid Date')
  const y = date.getUTCFullYear().toString().padStart(4, '0')
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}` as PlainDate
}

/** Milliseconds at UTC midnight of that calendar day. */
export function toEpochMs(date: PlainDate): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  return Date.UTC(y, m - 1, d)
}

const MS_PER_DAY = 86_400_000

/** Whole days from `from` to `to`. Positive when `to` is later. */
export function diffDays(from: PlainDate, to: PlainDate): number {
  return Math.round((toEpochMs(to) - toEpochMs(from)) / MS_PER_DAY)
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromUtcDate(new Date(toEpochMs(date) + days * MS_PER_DAY))
}

/** -1, 0 or 1. Lexicographic comparison is correct for this format. */
export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minDate(...dates: PlainDate[]): PlainDate | null {
  let best: PlainDate | null = null
  for (const d of dates) if (best === null || d < best) best = d
  return best
}

export function maxDate(...dates: PlainDate[]): PlainDate | null {
  let best: PlainDate | null = null
  for (const d of dates) if (best === null || d > best) best = d
  return best
}
