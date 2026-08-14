/**
 * The domain layer.
 *
 * Pure. No I/O, no framework, no provider knowledge, no clock reads. Everything
 * it needs is passed in, which is what makes the 7-stage rules exhaustively
 * testable and what lets the same rules run against the Excel export today and
 * ERPNext later without modification.
 *
 * Enforced by tests/architecture/boundaries.test.ts: nothing under src/domain
 * may import from outside src/domain.
 */

export * from './model'
export * from './milestones/stages'
export * from './milestones/timeline'
export * from './progress/schedule'
export * from './progress/project-progress'
