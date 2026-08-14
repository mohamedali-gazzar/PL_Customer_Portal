import { fromUtcDate, plainDate, type PlainDate } from '@/domain'
import type { Clock } from '@/ports/clock'

/**
 * Powerline operates in Egypt, so "today" means today in Cairo.
 *
 * Every countdown the portal shows — days to contractual date, days a drawing has
 * been awaiting approval — is computed from this. Deriving it from a server's
 * local time would make those numbers depend on where the process happens to run,
 * which on Vercel is not a fixed place.
 */
export const REPORTING_TIME_ZONE = 'Africa/Cairo'

export class SystemClock implements Clock {
  private readonly timeZone: string

  constructor(timeZone: string = REPORTING_TIME_ZONE) {
    this.timeZone = timeZone
  }

  now(): Date {
    return new Date()
  }

  today(): PlainDate {
    // en-CA renders as YYYY-MM-DD, which is exactly the PlainDate format.
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    return plainDate(formatted)
  }
}

/** Deterministic clock for tests and for reproducing a specific day. */
export class FixedClock implements Clock {
  private readonly date: PlainDate

  constructor(date: PlainDate) {
    this.date = date
  }

  now(): Date {
    return new Date(`${this.date}T12:00:00Z`)
  }

  today(): PlainDate {
    return this.date
  }
}

export function clockFromDate(date: Date): Clock {
  return new FixedClock(fromUtcDate(date))
}
