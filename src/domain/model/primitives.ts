import type { Maybe } from './maybe'

/**
 * A monetary amount always travels with its currency, and the currency is
 * itself a `Maybe` — the Excel backlog export has no currency column at all.
 *
 * PDF §5: "Always display document currency — never convert on the portal."
 * An amount whose currency is unknown therefore cannot be displayed as money,
 * which is exactly why the type refuses to let the two be separated.
 */
export interface Money {
  readonly amount: number
  readonly currency: Maybe<CurrencyCode>
}

declare const CurrencyBrand: unique symbol
export type CurrencyCode = string & { readonly [CurrencyBrand]: true }

export function currencyCode(value: string): CurrencyCode {
  const upper = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(upper)) throw new TypeError(`Not an ISO-4217 code: ${value}`)
  return upper as CurrencyCode
}

export function money(amount: number, currency: Maybe<CurrencyCode>): Money {
  if (!Number.isFinite(amount)) throw new TypeError(`Non-finite amount: ${amount}`)
  return { amount, currency }
}

/**
 * Text that may exist in English, Arabic or neither.
 *
 * `raw` is what the source actually holds. Most customer and project names in
 * the backlog export are Arabic free text, 15 of 107 customer names mix Latin
 * and Arabic, and one project name carries a stray bidirectional control
 * character — so the raw value is always kept and sanitised on the way in.
 */
export interface LocalizedText {
  readonly raw: string
  readonly en?: string
  readonly ar?: string
}

/**
 * Bidi control characters that corrupt surrounding layout when interpolated:
 * LRM, RLM, LRE, RLE, PDF, LRO, RLO, isolates, and the Arabic letter mark.
 */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g

const ARABIC_RANGES = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

export function localizedText(raw: string, parts?: { en?: string; ar?: string }): LocalizedText {
  return {
    raw: sanitizeText(raw),
    ...(parts?.en ? { en: sanitizeText(parts.en) } : {}),
    ...(parts?.ar ? { ar: sanitizeText(parts.ar) } : {}),
  }
}

/**
 * Strip bidi controls and normalise unicode form and whitespace.
 *
 * NFKC folds the presentation-form Arabic and full-width Latin variants that
 * appear in the export, so two spellings of one customer name normalise to the
 * same tenant key instead of silently becoming two tenants.
 */
export function sanitizeText(value: string): string {
  return value.normalize('NFKC').replace(BIDI_CONTROLS, '').replace(/\s+/g, ' ').trim()
}

export function hasArabic(value: string): boolean {
  return ARABIC_RANGES.test(value)
}

export function hasLatin(value: string): boolean {
  return /[A-Za-z]/.test(value)
}
