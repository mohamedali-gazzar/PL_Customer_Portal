/**
 * Assembles the 7 stage rules into an item timeline, and derives progress.
 */

import { known, notInSource, isKnown, pending, type Maybe } from '../model/maybe'
import type { PlainDate } from '../model/plain-date'
import type { ProviderCapabilities } from '../model/capabilities'
import type { ItemTimeline, OrderLine } from '../model/entities'
import {
  STAGE_IDS,
  stageFraction,
  type Milestone,
  type MilestoneSet,
  type StageId,
} from '../model/milestone'
import { STAGE_RULES, deriveBlockedOnCustomer, type StageInput } from './stages'

export function buildTimeline(
  line: OrderLine,
  capabilities: ProviderCapabilities,
  today: PlainDate,
): ItemTimeline {
  const input: StageInput = { line, capabilities, today }

  const milestones = Object.fromEntries(
    STAGE_IDS.map((stage) => [stage, STAGE_RULES[stage](input)]),
  ) as unknown as MilestoneSet

  const basis = progressBasis(milestones)

  return {
    milestones,
    currentStage: currentStage(milestones),
    nextMilestone: nextMilestone(milestones),
    progressPercent: progressPercent(milestones, basis),
    progressBasis: basis,
    blockedOnCustomer: deriveBlockedOnCustomer(input),
  }
}

/**
 * Which stages a percentage may legitimately be computed over.
 *
 * Only stages actually derived from evidence (or from PDF §4's documented
 * default) count. `partial` stages — derivable but with unobservable completion —
 * and `unavailable` ones are excluded, so a percentage can never imply that a
 * FAT passed, a payment cleared or a panel shipped when the source cannot say so.
 *
 * The basis travels with the number all the way to the UI, which must render it
 * as "x% of stages 1–3", never a bare "x% complete".
 */
export function progressBasis(milestones: MilestoneSet): readonly StageId[] {
  return STAGE_IDS.filter((s) => {
    const d = milestones[s].derivation
    return d === 'evidence' || d === 'default'
  })
}

export function progressPercent(
  milestones: MilestoneSet,
  basis: readonly StageId[],
): Maybe<number> {
  if (basis.length === 0) {
    return notInSource('no stage in this source can be derived for this item')
  }
  const total = basis.reduce((sum, s) => sum + stageFraction(milestones[s]), 0)
  return known(Math.round((total / basis.length) * 100))
}

/** The earliest stage that is derivable and not yet complete. */
export function currentStage(milestones: MilestoneSet): Maybe<StageId> {
  for (const s of STAGE_IDS) {
    const m = milestones[s]
    if (!isKnown(m.status)) continue
    if (!m.isComplete) return known(s)
  }
  return pending('every derivable stage is complete')
}

/**
 * The next thing due to happen, with its planned date when one exists.
 *
 * Planned end is preferred over planned start: the mockup's "Next milestone …
 * planned 12 Aug 2026" is the date the customer cares about.
 */
export function nextMilestone(
  milestones: MilestoneSet,
): Maybe<{ stage: StageId; plannedOn: Maybe<PlainDate> }> {
  for (const s of STAGE_IDS) {
    const m = milestones[s]
    if (!isKnown(m.status) || m.isComplete) continue
    const plannedOn = isKnown(m.plannedEnd)
      ? m.plannedEnd
      : isKnown(m.plannedStart)
        ? m.plannedStart
        : notInSource('this stage has no planned date in this source')
    return known({ stage: s, plannedOn })
  }
  return pending('no further derivable milestone')
}

/** Convenience for callers that need the milestones as an ordered array. */
export function orderedMilestones(milestones: MilestoneSet): readonly Milestone[] {
  return STAGE_IDS.map((s) => milestones[s])
}
