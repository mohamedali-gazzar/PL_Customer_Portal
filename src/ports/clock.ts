import type { PlainDate } from '@/domain'

/**
 * Injected time.
 *
 * The domain never reads the clock itself: every stage rule and every countdown
 * takes `today` as an argument. That is what makes "past contractual date",
 * milestone variance and drawing-approval age deterministically testable.
 */
export interface Clock {
  now(): Date
  /** Today's calendar date in the portal's reporting timezone. */
  today(): PlainDate
}
