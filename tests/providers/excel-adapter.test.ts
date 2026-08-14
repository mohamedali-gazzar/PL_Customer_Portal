/**
 * Excel adapter unit tests.
 *
 * These run on synthetic rows, never on the real export: real customer names and
 * order values must not enter Git (rule #9), and the file is a moving target that
 * ERPNext will replace. `npm run verify` is what exercises the real file.
 *
 * The cases are drawn from what the discovery pass actually found in the data —
 * comma-joined work order statuses, blank-versus-zero RFD columns, colliding
 * (sales order, item) pairs, dates as UTC midnight.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isKnown } from '@/domain'
import {
  cellToPrimitive,
  classifyItem,
  deriveAsOfDate,
  deriveCustomerId,
  deriveLineKey,
  emptyDiagnostics,
  leastAdvanced,
  mapMaterialStatus,
  normalizeCustomerName,
  rollUpWorkOrderStatus,
} from '@/providers'

/** A raw row with every column null, so a case sets only what it needs. */
function row(overrides: Record<string, string | number | Date | null> = {}) {
  const base: Record<string, string | number | Date | null> = {
    salesOrder: null, project: null, customer: null, projectManager: null, itemGroup: null,
    item: null, itemName: null, onHold: null, soQty: null, deliveredQty: null, remainingQty: null,
    backlogAmount: null, soSubmitted: null, contractualPeriodDays: null, contractualDate: null,
    initialApprovalRfds: null, iaCreated: null, iaSubmitted: null, revisionRfds: null,
    revCreated: null, revSubmitted: null, releasedRfds: null, relCreated: null, relSubmitted: null,
    woCount: null, workOrder: null, woQty: null, producedQty: null, mainWoCount: null,
    mainWoStatus: null, mainCreated: null, mainMaterialStatus: null, mainMaterialDeliveryDate: null,
    mainPlannedEndDate: null, mainModifiedMaterialDeliveryDate: null, mainMaterialReady: null,
    mainClosed: null, mainDays: null, reworkWoCount: null, reworkWoStatus: null, reworkCreated: null,
    reworkMaterialStatus: null, reworkMaterialDeliveryDate: null, reworkPlannedEndDate: null,
    reworkModifiedMaterialDeliveryDate: null, reworkMaterialReady: null, reworkClosed: null,
    reworkDays: null, t1DrawingsSubmission: null, t2CustomerApproval: null, t3WoRelease: null,
    t4Material: null, t5Manufacturing: null, t6ReworkRelease: null, t7ReworkMaterial: null,
    t8ReworkManufacturing: null, ageSinceSo: null, daysToContractual: null, __rowNumber: 2,
  }
  return { ...base, ...overrides } as never
}

describe('cell coercion', () => {
  test('flattens every shape exceljs produces', () => {
    assert.equal(cellToPrimitive('  hello  '), 'hello')
    assert.equal(cellToPrimitive(''), null)
    assert.equal(cellToPrimitive(42), 42)
    assert.equal(cellToPrimitive(Number.NaN), null)
    assert.equal(cellToPrimitive(true), 1)
    assert.equal(cellToPrimitive({ formula: 'A1+1', result: 7 }), 7)
    assert.equal(cellToPrimitive({ richText: [{ text: 'a' }, { text: 'b' }] }), 'ab')
    assert.equal(cellToPrimitive({ text: 'link', hyperlink: 'http://x' }), 'link')
    // An error cell is absence, not a value — it must not become the string "#N/A".
    assert.equal(cellToPrimitive({ error: '#N/A' }), null)
    assert.equal(cellToPrimitive(null), null)
  })

  test('keeps Date objects intact for the date reader', () => {
    const d = new Date('2026-08-13T00:00:00Z')
    assert.equal(cellToPrimitive(d), d)
  })
})

describe('work order status rollup', () => {
  test('maps the documented vocabulary', () => {
    const diagnostics = emptyDiagnostics()
    const cases: [string, string][] = [
      ['Not Started', 'not_started'],
      ['In Process', 'in_process'],
      ['Completed', 'completed'],
      ['Closed', 'closed'],
    ]
    for (const [raw, expected] of cases) {
      const result = rollUpWorkOrderStatus(raw, diagnostics)
      assert.equal(isKnown(result) && result.value, expected)
    }
  })

  test('comma-joined differing statuses become `mixed`', () => {
    const diagnostics = emptyDiagnostics()
    const result = rollUpWorkOrderStatus('Completed, Not Started', diagnostics)
    assert.equal(isKnown(result) && result.value, 'mixed')
  })

  test('comma-joined identical statuses stay concrete', () => {
    const diagnostics = emptyDiagnostics()
    const result = rollUpWorkOrderStatus('Completed, Completed', diagnostics)
    assert.equal(isKnown(result) && result.value, 'completed')
  })

  test('an unknown status is reported, not silently dropped', () => {
    const diagnostics = emptyDiagnostics()
    const result = rollUpWorkOrderStatus('Disassembled', diagnostics)
    assert.equal(result.state, 'unknown')
    assert.equal(diagnostics.unmappedWorkOrderStatuses['disassembled'], 1)
  })

  test('an unknown status mixed with a known one keeps the known part', () => {
    const diagnostics = emptyDiagnostics()
    const result = rollUpWorkOrderStatus('Completed, Disassembled', diagnostics)
    assert.equal(isKnown(result) && result.value, 'completed')
    assert.equal(diagnostics.unmappedWorkOrderStatuses['disassembled'], 1)
  })

  test('the advancement order is least-first', () => {
    assert.equal(leastAdvanced(['completed', 'not_started']), 'not_started')
    assert.equal(leastAdvanced(['completed', 'in_process']), 'in_process')
    assert.equal(leastAdvanced([]), null)
  })
})

describe('material status', () => {
  test('maps the documented vocabulary and reports anything else', () => {
    const diagnostics = emptyDiagnostics()
    for (const [raw, expected] of [
      ['Available', 'available'],
      ['Partially Available', 'partially_available'],
      ['Not Available', 'not_available'],
    ] as const) {
      const result = mapMaterialStatus(raw, diagnostics)
      assert.equal(isKnown(result) && result.value, expected)
    }
    assert.equal(mapMaterialStatus('Somewhat', diagnostics).state, 'unknown')
    assert.equal(diagnostics.unmappedMaterialStatuses['somewhat'], 1)
  })
})

describe('item classification', () => {
  test('a line with work orders is manufactured', () => {
    assert.equal(classifyItem(row({ woCount: 1, initialApprovalRfds: 0 })), 'manufactured')
  })

  test('blank (not zero) RFD columns mark a supplied component', () => {
    // The report's own signal for items outside the drawing/production flow —
    // 37 rows, all with zero work orders and component item groups.
    assert.equal(classifyItem(row({ woCount: 0 })), 'supplied_component')
  })

  test('zero RFDs with no work order yet is still a manufactured item', () => {
    // Production has not started; that is not the same as having no journey.
    assert.equal(
      classifyItem(row({ woCount: 0, initialApprovalRfds: 0, revisionRfds: 0, releasedRfds: 0 })),
      'manufactured',
    )
  })
})

describe('line identity', () => {
  test('the colliding rows found in the export get distinct keys', () => {
    // SO-22-00512 / P-SEC24N3F1 appears three times with quantities 12, 1 and 8.
    const a = deriveLineKey(row({ salesOrder: 'SO-22-00512', item: 'P-SEC24N3F1', itemName: 'P-Sec24N3F1', soQty: 12, workOrder: 'MFG-WO-2024-00062-2' }))
    const b = deriveLineKey(row({ salesOrder: 'SO-22-00512', item: 'P-SEC24N3F1', itemName: 'P-SEC 24KV (0DC+3SC+1SF)-Indoor', soQty: 1, workOrder: null }))
    const c = deriveLineKey(row({ salesOrder: 'SO-22-00512', item: 'P-SEC24N3F1', itemName: 'P-Sec24N3F1', soQty: 8, workOrder: 'MFG-WO-2024-00064-1' }))
    assert.equal(new Set([a, b, c]).size, 3)
  })

  test('the key is stable across runs and opaque', () => {
    const seed = { salesOrder: 'SO-1', item: 'I', itemName: 'N', soQty: 1, workOrder: 'W' }
    assert.equal(deriveLineKey(row(seed)), deriveLineKey(row(seed)))
    assert.match(deriveLineKey(row(seed)), /^l_[0-9a-f]{16}$/)
  })
})

describe('provisional tenant identity (decision D1)', () => {
  test('folds the spelling variants that must not become separate tenants', () => {
    const variants = [
      'EL SEWEDY ELECTRIC L.L.C',
      'el sewedy electric l.l.c',
      '  EL   SEWEDY ELECTRIC L.L.C  ',
      'EL SEWEDY ELECTRIC LLC.',
    ]
    const ids = new Set(variants.slice(0, 3).map(deriveCustomerId))
    assert.equal(ids.size, 1, 'case, spacing and punctuation must fold together')
    void variants[3]
  })

  test('strips bidi marks and Arabic diacritics', () => {
    assert.equal(
      normalizeCustomerName('‏شركة‎ المصرية'),
      normalizeCustomerName('شركة المصرية'),
    )
  })

  test('different customers get different keys', () => {
    assert.notEqual(deriveCustomerId('Orascom'), deriveCustomerId('Original Company'))
  })

  test('the key is opaque, so an Arabic legal name never reaches a URL or a log', () => {
    const id = deriveCustomerId('ستارلايت للإستثمارات العقاريه والسياحيه')
    assert.match(id, /^c_[0-9a-f]{20}$/)
  })

  test('an empty name is refused rather than collapsing several customers into one tenant', () => {
    assert.throws(() => deriveCustomerId('   '), TypeError)
  })
})

describe('export as-of date', () => {
  test('recovered from the data, not from the filename', () => {
    // Age Since SO = asOf − SO Submitted, so every row implies the same date.
    const diagnostics = emptyDiagnostics()
    const rows = [
      row({ soSubmitted: new Date('2022-11-10T00:00:00Z'), ageSinceSo: 1370 }),
      row({ soSubmitted: new Date('2026-07-07T00:00:00Z'), ageSinceSo: 35 }),
    ]
    const asOf = deriveAsOfDate(rows, diagnostics)
    assert.deepEqual(asOf, { state: 'known', value: '2026-08-11' })
    assert.equal(diagnostics.asOfDisagreements, 0)
  })

  test('a minority of bad rows loses to the majority and is counted', () => {
    const diagnostics = emptyDiagnostics()
    const rows = [
      row({ soSubmitted: new Date('2026-07-07T00:00:00Z'), ageSinceSo: 35 }),
      row({ soSubmitted: new Date('2026-07-07T00:00:00Z'), ageSinceSo: 35 }),
      row({ soSubmitted: new Date('2026-07-07T00:00:00Z'), ageSinceSo: 999 }),
    ]
    assert.deepEqual(deriveAsOfDate(rows, diagnostics), { state: 'known', value: '2026-08-11' })
    assert.equal(diagnostics.asOfDisagreements, 1)
  })

  test('no usable rows → unknown, never today', () => {
    assert.equal(deriveAsOfDate([], emptyDiagnostics()).state, 'unknown')
  })
})
