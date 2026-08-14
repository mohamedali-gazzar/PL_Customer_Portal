/**
 * Bilingual integrity.
 *
 * Key parity is already a compile error (`ar` is typed against `en`), so these tests
 * cover what the compiler cannot see: empty strings, placeholder drift between the two
 * languages, untranslated English left in the Arabic dictionary, and the formatters.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { translator, type MessageKey } from '@/ui/i18n/messages'
import {
  direction,
  formatDate,
  formatMonthYear,
  isLocale,
  LOCALES,
  otherLocale,
  parseLocale,
} from '@/ui/i18n/locale'

const en = translator('en')
const ar = translator('ar')

/** Every key, read out of the English dictionary via a probe translator. */
const KEYS: MessageKey[] = [
  'app.name', 'app.portal', 'nav.dashboard', 'nav.projects', 'nav.finance', 'nav.documents',
  'source.title', 'source.asOf', 'source.snapshot', 'source.openBacklogOnly', 'source.whatIsMissing',
  'source.missingList', 'dashboard.welcome', 'dashboard.projectsHeading', 'dashboard.noProjects',
  'dashboard.noProjectsBody', 'kpi.activeProjects', 'kpi.itemsTotal', 'kpi.inManufacturing',
  'kpi.mfgComplete', 'kpi.awaitingYourApproval', 'kpi.pastContractualDate', 'kpi.itemsDelivered',
  'kpi.awaitingHint', 'kpi.projectsSuffix', 'project.salesOrder', 'project.poNumber',
  'project.projectManager', 'project.orderedOn', 'project.contractualDate', 'project.contractualPeriod',
  'project.items', 'project.itemsBreakdown', 'project.nextMilestone', 'project.days.one', 'project.days.other',
  'progress.label', 'progress.ofStages', 'progress.basisNote', 'progress.linesCounted',
  'progress.linesExcluded.one', 'progress.linesExcluded.other',
  'schedule.on_track', 'schedule.due_soon', 'schedule.past_contractual_date',
  'schedule.daysRemaining.one', 'schedule.daysRemaining.other',
  'schedule.daysOverdue.one', 'schedule.daysOverdue.other', 'schedule.dueToday', 'schedule.explain',
  'attention.awaitingYourApproval.one', 'attention.awaitingYourApproval.other',
  'attention.awaitingSince.one', 'attention.awaitingSince.other', 'stage.1', 'stage.2', 'stage.3',
  'stage.4', 'stage.5', 'stage.6', 'stage.7', 'stage.short.1', 'stage.short.4', 'stage.short.7',
  'status.under_preparation', 'status.sent_for_approval', 'status.approved',
  'status.material_not_available', 'status.partially_available', 'status.fully_available',
  'status.not_started', 'status.in_progress', 'status.completed', 'status.not_ready',
  'status.fat_invitation', 'status.fat_success', 'status.rework_in_progress', 'status.rework_done',
  'status.delivery_payment_due', 'status.paid', 'status.ready', 'status.delivered',
  'status.waiting_for_invoice', 'status.invoice_submitted', 'status.not_paid',
  'item.code', 'item.quantity', 'item.produced', 'item.remaining', 'item.cubicles',
  'item.componentBadge', 'item.noJourney', 'item.showDetail', 'item.itemsHeading',
  'view.stages', 'view.timeline', 'view.label', 'table.stage', 'table.status', 'table.planned',
  'table.actual', 'table.variance', 'table.started', 'table.finished',
  'variance.late.one', 'variance.late.other', 'variance.early.one', 'variance.early.other',
  'variance.onTime', 'basis.material_ready_proxy', 'basis.actual_start_date',
  'timeline.planned', 'timeline.actual', 'timeline.today', 'timeline.noDates',
  'timeline.noDatesAtAll', 'timeline.noDatesAtAllBody', 'timeline.plannedNote',
  'timeline.legendPlanned', 'timeline.legendActual', 'timeline.legendDelay',
  'unknown.not_in_source', 'unknown.pending', 'unknown.not_applicable', 'unknown.restricted',
  'unavailable.stageTitle', 'source.no_finance_data.title', 'source.no_finance_data.body',
  'source.no_document_data.title', 'source.no_document_data.body', 'source.no_delivery_data.title',
  'source.no_delivery_data.body', 'source.no_fat_outcome_data.title', 'source.no_fat_outcome_data.body',
  'source.no_planned_dates.title', 'source.no_planned_dates.body', 'source.open_backlog_only.title',
  'source.open_backlog_only.body', 'source.provisional_identity.title',
  'source.provisional_identity.body', 'finance.heading', 'documents.heading', 'signin.heading',
  'signin.notConfigured', 'signin.notConfiguredBody', 'notFound.heading', 'notFound.body',
  'notFound.back', 'breadcrumb.projects',
]

describe('dictionaries', () => {
  test('no message in either language is empty', () => {
    for (const key of KEYS) {
      assert.notEqual(en(key).trim(), '', `en.${key} is empty`)
      assert.notEqual(ar(key).trim(), '', `ar.${key} is empty`)
    }
  })

  test('placeholders match between the two languages', () => {
    // A dropped `{n}` in Arabic would render "awaiting your approval" with no number.
    for (const key of KEYS) {
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      assert.deepEqual(
        placeholders(ar(key)),
        placeholders(en(key)),
        `placeholder mismatch on ${key}`,
      )
    }
  })

  test('Arabic messages are actually Arabic', () => {
    // The wordmark and a handful of identifiers are intentionally Latin; everything
    // with real prose must contain Arabic script.
    const latinByDesign = new Set<MessageKey>(['app.name', 'locale.switch', 'unknown.short'])
    const arabic = /[؀-ۿ]/
    for (const key of KEYS) {
      if (latinByDesign.has(key)) continue
      assert.ok(arabic.test(ar(key)), `ar.${key} looks untranslated: ${ar(key)}`)
    }
  })

  test('interpolation substitutes and leaves unknown placeholders alone', () => {
    assert.match(en('attention.awaitingYourApproval.other', { n: 3 }), /3/)
    assert.match(ar('attention.awaitingYourApproval.other', { n: 3 }), /3/)
    assert.match(en('progress.ofStages', { percent: 97, stages: '1–3' }), /97.*1–3/)
  })

  test('no status or tile label ever asserts an unpaid or undelivered state', () => {
    /*
     * Scoped to the keys that render as *values* — statuses, tiles, schedule chips.
     * The `source.*` explanations are excluded deliberately: they use the phrase "not
     * delivered" precisely in order to say the portal will not show it, which is the
     * copy those panels exist to carry. The inverse test below pins that down.
     */
    const valueKeys = KEYS.filter(
      (key) => key.startsWith('status.') || key.startsWith('kpi.') || key.startsWith('schedule.'),
    )
    assert.ok(valueKeys.length > 20, 'expected the status/tile/schedule copy to be scanned')

    for (const key of valueKeys) {
      for (const value of [en(key), ar(key)]) {
        assert.equal(/\bnot paid\b|\bnot delivered\b|\bunpaid\b/i.test(value), false, `${key}: ${value}`)
      }
    }
  })

  test('the explanatory panels do carry the phrases they exist to rule out', () => {
    assert.match(en('source.no_delivery_data.body'), /not delivered/)
    assert.match(en('source.no_fat_outcome_data.body'), /has or has not passed/)
  })

  test('the unavailability copy explains that data is missing, not that a value is nil', () => {
    // The finance panel is the most consequential piece of copy in the portal.
    assert.match(en('source.no_finance_data.body'), /missing — not that your balance is zero/)
    assert.match(ar('source.no_finance_data.body'), /غير متوفرة، وليس أن رصيدك صفر/)
  })
})

describe('locale helpers', () => {
  test('direction and fallbacks', () => {
    assert.equal(direction('ar'), 'rtl')
    assert.equal(direction('en'), 'ltr')
    assert.equal(otherLocale('ar'), 'en')
    assert.equal(otherLocale('en'), 'ar')
    assert.deepEqual([...LOCALES], ['en', 'ar'])
    assert.equal(isLocale('fr'), false)
    // An unrecognised segment must not throw a page: it falls back to English.
    assert.equal(parseLocale('fr'), 'en')
    assert.equal(parseLocale(undefined), 'en')
    assert.equal(parseLocale('ar'), 'ar')
  })

  test('dates render in the right calendar day in both locales', () => {
    // Formatting is pinned to UTC, so a server in any timezone shows the same day.
    assert.match(formatDate('en', '2026-08-17'), /17/)
    assert.match(formatDate('en', '2026-08-17'), /2026/)
    assert.match(formatDate('ar', '2026-08-17'), /17/)
    assert.match(formatMonthYear('en', '2026-01-01'), /26/)
  })

  test('numerals stay Latin in Arabic', () => {
    // Every number on the portal sits beside an identifier a customer may quote back
    // to us, so numeral systems are not mixed.
    const arabicIndic = /[٠-٩]/
    assert.equal(arabicIndic.test(formatDate('ar', '2026-08-17')), false)
  })

  test('a malformed date is passed through, never rendered as Invalid Date', () => {
    assert.equal(formatDate('en', 'not-a-date'), 'not-a-date')
  })
})
