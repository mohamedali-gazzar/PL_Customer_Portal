/**
 * The honesty primitive.
 *
 * Every field whose availability depends on the active data source is a
 * `Maybe<T>`, never `T | null | undefined`. This makes "we do not know" a
 * value the type system forces callers to handle, so a missing figure can
 * never be silently rendered as 0, "Not paid" or "Not delivered".
 *
 * Development rule #5: do not fabricate missing backend information.
 */

export type UnknownReason =
  /** The active provider has no field for this at all (e.g. invoices in the Excel export). */
  | 'not_in_source'
  /** Meaningful for some records but not this one (e.g. a 7-stage tracker on a loose component). */
  | 'not_applicable'
  /** Will exist later in the record's own lifecycle; nothing has happened yet. */
  | 'pending'
  /** Exists in the source but is deliberately withheld from this audience. */
  | 'restricted'

export interface Known<T> {
  readonly state: 'known'
  readonly value: T
}

export interface Unknown {
  readonly state: 'unknown'
  readonly reason: UnknownReason
  /** Short operator-facing explanation, e.g. "Excel backlog export has no Sales Invoice data". */
  readonly note?: string
}

export type Maybe<T> = Known<T> | Unknown

export function known<T>(value: T): Known<T> {
  return { state: 'known', value }
}

export function unknown(reason: UnknownReason, note?: string): Unknown {
  return note === undefined ? { state: 'unknown', reason } : { state: 'unknown', reason, note }
}

export const notInSource = (note?: string): Unknown => unknown('not_in_source', note)
export const notApplicable = (note?: string): Unknown => unknown('not_applicable', note)
export const pending = (note?: string): Unknown => unknown('pending', note)
export const restricted = (note?: string): Unknown => unknown('restricted', note)

export function isKnown<T>(m: Maybe<T>): m is Known<T> {
  return m.state === 'known'
}

export function isUnknown<T>(m: Maybe<T>): m is Unknown {
  return m.state === 'unknown'
}

/**
 * Lift a nullable source value. `reason` describes why it would be absent —
 * pick it deliberately: `pending` when the event simply has not happened,
 * `not_in_source` when the provider cannot ever supply it.
 */
export function fromNullable<T>(
  value: T | null | undefined,
  reason: UnknownReason,
  note?: string,
): Maybe<T> {
  return value === null || value === undefined ? unknown(reason, note) : known(value)
}

export function mapMaybe<T, U>(m: Maybe<T>, f: (value: T) => U): Maybe<U> {
  return isKnown(m) ? known(f(m.value)) : m
}

/** Combine two Maybes. Unknown wins, and the left-hand reason is preserved. */
export function zipMaybe<A, B, C>(a: Maybe<A>, b: Maybe<B>, f: (a: A, b: B) => C): Maybe<C> {
  if (!isKnown(a)) return a
  if (!isKnown(b)) return b
  return known(f(a.value, b.value))
}

export function valueOr<T>(m: Maybe<T>, fallback: T): T {
  return isKnown(m) ? m.value : fallback
}

/** Only for genuinely optional presentation, never for computation. */
export function valueOrNull<T>(m: Maybe<T>): T | null {
  return isKnown(m) ? m.value : null
}

/** First known value, else the last unknown. Useful for source-field fallbacks. */
export function firstKnown<T>(...candidates: Maybe<T>[]): Maybe<T> {
  let last: Unknown = notInSource()
  for (const c of candidates) {
    if (isKnown(c)) return c
    last = c
  }
  return last
}
