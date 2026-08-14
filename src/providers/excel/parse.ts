/**
 * Workbook → typed raw rows.
 *
 * This module knows about spreadsheets and nothing else. It performs no business
 * interpretation: its job is to prove the file has the shape we expect and to
 * hand up plainly-typed cells.
 */

import ExcelJS from 'exceljs'
import { COLUMNS, COLUMN_KEYS, EXPECTED_COLUMN_COUNT, SHEET_NAME, type ColumnKey } from './columns'

/** One spreadsheet row, cells coerced to primitives, nothing interpreted. */
export type RawBacklogRow = Readonly<Record<ColumnKey, string | number | Date | null>> & {
  readonly __rowNumber: number
}

export interface ParseResult {
  readonly rows: readonly RawBacklogRow[]
  readonly sheetName: string
  readonly headerWarnings: readonly string[]
}

export class ExcelShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExcelShapeError'
  }
}

/**
 * exceljs materialises cells as several different shapes depending on whether
 * they hold a formula, rich text, a hyperlink or an error. Flatten them all to a
 * primitive so no downstream code has to care.
 */
export function cellToPrimitive(value: unknown): string | number | Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    // Formula cell: take the computed result, recursively.
    if ('result' in o) return cellToPrimitive(o.result)
    // An error cell (#N/A, #REF!) is absence, not a value.
    if ('error' in o) return null
    if ('richText' in o && Array.isArray(o.richText)) {
      const text = o.richText.map((part) => String((part as { text?: unknown }).text ?? '')).join('')
      return cellToPrimitive(text)
    }
    if ('text' in o) return cellToPrimitive(o.text)
    if ('hyperlink' in o) return cellToPrimitive(o.hyperlink)
  }
  return null
}

export async function parseBacklogWorkbook(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(filePath)
  } catch (cause) {
    throw new ExcelShapeError(
      `Could not read the backlog export at "${filePath}". ` +
        `Set EXCEL_BACKLOG_PATH to the .xlsx location (it belongs under data/, which is gitignored). ` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }

  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0]
  if (!sheet) throw new ExcelShapeError('The workbook contains no worksheets.')

  const headerRow = sheet.getRow(1)
  const header: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const v = cellToPrimitive(cell.value)
    header[col - 1] = v === null ? '' : String(v)
  })

  const { indexByKey, warnings } = mapHeader(header)

  const rows: RawBacklogRow[] = []
  const lastRow = sheet.rowCount
  for (let r = 2; r <= lastRow; r += 1) {
    const row = sheet.getRow(r)
    const record: Record<string, string | number | Date | null> = { __rowNumber: r }
    let hasValue = false
    for (const key of COLUMN_KEYS) {
      const columnIndex = indexByKey[key]
      const value = columnIndex === undefined ? null : cellToPrimitive(row.getCell(columnIndex + 1).value)
      record[key] = value
      if (value !== null) hasValue = true
    }
    // Trailing blank rows are an artefact of the export, not data.
    if (hasValue) rows.push(record as RawBacklogRow)
  }

  return { rows, sheetName: sheet.name, headerWarnings: warnings }
}

/**
 * Match the real header against the expected contract.
 *
 * A missing column is fatal. An unexpected extra column is a warning: the report
 * gaining a column does not break existing mappings, but somebody should look.
 */
function mapHeader(header: readonly string[]): {
  indexByKey: Partial<Record<ColumnKey, number>>
  warnings: string[]
} {
  const normalized = header.map((h) => h.replace(/\s+/g, ' ').trim())
  const indexByKey: Partial<Record<ColumnKey, number>> = {}
  const missing: string[] = []

  for (const key of COLUMN_KEYS) {
    const expected = COLUMNS[key]
    const index = normalized.findIndex((h) => h.toLowerCase() === expected.toLowerCase())
    if (index === -1) missing.push(expected)
    else indexByKey[key] = index
  }

  if (missing.length > 0) {
    throw new ExcelShapeError(
      `The backlog export is missing ${missing.length} expected column(s): ${missing.join(', ')}.\n` +
        `Found ${normalized.filter(Boolean).length} columns, expected ${EXPECTED_COLUMN_COUNT}.\n` +
        `Either the report changed or the wrong file was supplied. Refusing to load rather than ` +
        `render blank milestones that would read as "nothing has happened".`,
    )
  }

  const known = new Set(Object.values(COLUMNS).map((c) => c.toLowerCase()))
  const warnings = normalized
    .filter((h) => h !== '' && !known.has(h.toLowerCase()))
    .map((h) => `Unmapped column in export, ignored: "${h}"`)

  return { indexByKey, warnings }
}
