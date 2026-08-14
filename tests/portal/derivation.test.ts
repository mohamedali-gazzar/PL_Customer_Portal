/**
 * The derivation is correct if, and only if, it reproduces the approved design.
 *
 * `Powerline_Customer_Portal_4.html` was signed off with a fully-derived dataset
 * inline. This test replays the raw export through our own rules and asserts the
 * result matches that dataset field for field: 480 order lines × 7 milestones ×
 * (state, status, start, end, planned), plus every rollup and every statistic.
 *
 * It is the regression net for the whole product. If a rule changes here, a
 * customer somewhere sees a different status — and this test says so by name.
 *
 * Both inputs are real customer data and live in gitignored data/. When either is
 * absent the test skips loudly rather than passing vacuously:
 *
 *   node scripts/extract-prototype-oracle.mjs <prototype.html>
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { parseBacklogWorkbook } from '@/providers/excel/parse'
import { deriveSnapshot } from '@/portal/derive'
import type { PortalItem, PortalOrder, PortalSnapshot } from '@/portal/types'

const EXPORT_PATH = process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx'
const ORACLE_PATH = 'data/prototype-oracle.json'

const ready = existsSync(EXPORT_PATH) && existsSync(ORACLE_PATH)

/** The prototype stores labels once and refers to them by index, to stay small. */
interface Oracle {
  meta: Record<string, unknown> & { exportDate: string; bench: Record<string, number>[] }
  labels: string[]
  items: OracleItem[]
  orders: Record<string, unknown>[]
  customers: Record<string, unknown>[]
}
interface OracleItem {
  st: [number, number, string | null, string | null, string | null][]
  next: number
  nextLabel: number
  [k: string]: unknown
}

/** Collects every disagreement so one run reports all of them, not just the first. */
class Diff {
  private readonly counts = new Map<string, number>()
  private readonly samples = new Map<string, string[]>()

  check(field: string, got: unknown, want: unknown, where: string | number): void {
    const g = normalise(got)
    const w = normalise(want)
    const equal = Array.isArray(g) || Array.isArray(w)
      ? JSON.stringify(g) === JSON.stringify(w)
      : Object.is(g, w)
    if (equal) return
    this.counts.set(field, (this.counts.get(field) ?? 0) + 1)
    const s = this.samples.get(field) ?? []
    if (s.length < 3) {
      s.push(`${where}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`)
      this.samples.set(field, s)
    }
  }

  assertClean(what: string): void {
    if (this.counts.size === 0) return
    const lines = [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `  ${f} — ${n} mismatch(es)\n${(this.samples.get(f) ?? []).map((x) => `      ${x}`).join('\n')}`)
    assert.fail(`${what} does not match the approved prototype:\n${lines.join('\n')}`)
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Two deliberate tolerances, and only two.
 *
 * Floats are compared to two decimal places: money is carried as a rate times a
 * quantity, so the last bits of a double are noise, not information.
 *
 * Strings are compared trimmed. 23 item names in the export carry a trailing
 * space ("EPP-KIT ") which the prototype kept verbatim and our loader strips.
 * Stripping is the correct behaviour — an invisible trailing space makes a name
 * that looks identical compare unequal, which would silently split groupings and
 * lookups later — and it changes nothing a customer sees, because HTML collapses
 * trailing whitespace anyway.
 */
function normalise(v: unknown): unknown {
  if (typeof v === 'number') return round2(v)
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v)) return v.map(normalise)
  return v ?? null
}

async function build(): Promise<{ snapshot: PortalSnapshot; oracle: Oracle }> {
  const { rows } = await parseBacklogWorkbook(EXPORT_PATH)
  // A deliberately wrong fallback: the as-of date must come from the data.
  const snapshot = deriveSnapshot(rows, '1970-01-01')
  const oracle = JSON.parse(readFileSync(ORACLE_PATH, 'utf8')) as Oracle
  return { snapshot, oracle }
}

test('derivation reproduces the approved prototype', { skip: ready ? false : skipReason() }, async (t) => {
  const { snapshot, oracle } = await build()

  await t.test('the export is read in full', () => {
    assert.equal(snapshot.items.length, oracle.items.length)
    assert.equal(snapshot.orders.length, oracle.orders.length)
    assert.equal(snapshot.customers.length, oracle.customers.length)
  })

  await t.test('the as-of date is recovered from the rows, not the filename', () => {
    assert.equal(snapshot.meta.exportDate, oracle.meta.exportDate)
  })

  await t.test('every field of every item line', () => {
    const d = new Diff()
    const L = (i: number | null) => (i === null || i === undefined ? null : oracle.labels[i]!)

    const scalars: (keyof PortalItem)[] = [
      'so', 'proj', 'cust', 'pm', 'grp', 'code', 'name', 'hold', 'qty', 'deliv', 'remain',
      'rate', 'contract', 'backlog', 'dvalue', 'soDate', 'cDate', 'cPeriod', 'wo', 'woQty',
      'prodQty', 'woStatus', 'matStatus', 'rework', 'rwStatus', 'nIA', 'nRev', 'nRel',
      'age', 'dtc', 'late', 'pct',
    ]

    snapshot.items.forEach((got, i) => {
      const want = oracle.items[i]!
      for (const f of scalars) d.check(`item.${f}`, got[f], want[f], i)
      d.check('item.ch', got.ch, want.ch, i)
      d.check('item.T', got.T, want.T, i)
      d.check('item.nextStage', got.nextStage, L(want.next), i)
      d.check('item.nextStatus', got.nextStatus, L(want.nextLabel), i)

      got.st.forEach((gs, k) => {
        const ws = want.st[k]!
        d.check(`stage${k + 1}.state`, gs[0], ws[0], i)
        d.check(`stage${k + 1}.status`, gs[1], L(ws[1]), i)
        d.check(`stage${k + 1}.start`, gs[2], ws[2], i)
        d.check(`stage${k + 1}.end`, gs[3], ws[3], i)
        d.check(`stage${k + 1}.planned`, gs[4], ws[4], i)
      })
    })

    d.assertClean('Item derivation')
  })

  await t.test('order rollups, including their sort order', () => {
    const d = new Diff()
    assert.deepEqual(
      snapshot.orders.map((o) => o.so),
      oracle.orders.map((o) => o.so),
      'orders must be ordered by open backlog, largest first',
    )
    const byId = new Map(oracle.orders.map((o) => [o.so as string, o]))
    const fields: (keyof PortalOrder)[] = [
      'proj', 'cust', 'pm', 'soDate', 'cDate', 'cPeriod', 'contract', 'backlog', 'dvalue',
      'qty', 'deliv', 'hold', 'pct', 'nItems', 'late', 'dtc', 'age', 'await', 'next',
    ]
    for (const got of snapshot.orders) {
      const want = byId.get(got.so)!
      for (const f of fields) d.check(`order.${f}`, got[f], want[f], got.so)
      d.check('order.items', got.items, want.items, got.so)
    }
    d.assertClean('Order rollup')
  })

  await t.test('customer rollups, including their sort order', () => {
    const d = new Diff()
    assert.deepEqual(
      snapshot.customers.map((c) => c.name),
      oracle.customers.map((c) => c.name),
    )
    const byName = new Map(oracle.customers.map((c) => [c.name as string, c]))
    for (const got of snapshot.customers) {
      const want = byName.get(got.name)!
      for (const f of ['contract', 'backlog', 'dvalue', 'nItems', 'late', 'await', 'nOrders', 'pct'] as const) {
        d.check(`customer.${f}`, got[f], want[f], got.name)
      }
      d.check('customer.orders', got.orders, want.orders, got.name)
    }
    d.assertClean('Customer rollup')
  })

  await t.test('portfolio totals and phase cycle-time statistics', () => {
    const d = new Diff()
    for (const f of ['rows', 'orders', 'customers', 'backlog', 'contract', 'delivered', 'lateOrders', 'holdOrders'] as const) {
      d.check(`meta.${f}`, snapshot.meta[f], oracle.meta[f], 'meta')
    }
    snapshot.meta.bench.forEach((got, i) => {
      const want = oracle.meta.bench[i]!
      for (const f of ['count', 'med', 'avg', 'p90', 'max'] as const) {
        d.check(`bench.${f}`, got[f], want[f], got.n)
      }
    })
    d.check('meta.pms', snapshot.meta.pms, oracle.meta.pms, 'meta')
    d.check('meta.groups', snapshot.meta.groups, oracle.meta.groups, 'meta')
    d.assertClean('Portfolio metadata')
  })
})

function skipReason(): string {
  const missing = [
    existsSync(EXPORT_PATH) ? null : `the export (${EXPORT_PATH})`,
    existsSync(ORACLE_PATH) ? null : `the prototype oracle (${ORACLE_PATH}) — run scripts/extract-prototype-oracle.mjs`,
  ].filter(Boolean)
  return `Skipped: missing ${missing.join(' and ')}. Both are real customer data and are gitignored.`
}
