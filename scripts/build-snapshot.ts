/**
 * Derive a portal snapshot from the backlog export, ready to upload.
 *
 *   npm run build:snapshot                 → data/portal-snapshot.json  (real data)
 *   npm run build:snapshot -- --anonymise  → data/portal-snapshot-demo.json
 *
 * The output is what `PORTAL_DATA_PROVIDER=snapshot` reads. Deriving here rather
 * than in the deployment is what keeps the spreadsheet — and the customer data in
 * it — out of the repository and off the host.
 *
 * `--anonymise` replaces every identifying string with a synthetic one while
 * leaving all dates, quantities and values untouched. The result exercises exactly
 * the same code paths and looks exactly the same on screen, but names no customer,
 * project, panel or engineer. Use it for any deployment on a public URL.
 */

import { writeFile } from 'node:fs/promises'
import { argv } from 'node:process'

import { loadXlsxSnapshot } from '@/providers/xlsx'
import type { PortalSnapshot } from '@/portal/types'

const anonymise = argv.includes('--anonymise') || argv.includes('--anonymize')
const source = process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx'
const target = anonymise ? 'data/portal-snapshot-demo.json' : 'data/portal-snapshot.json'

const { snapshot, warnings } = await loadXlsxSnapshot(source)
for (const w of warnings) console.warn(`  warning: ${w}`)

const out: PortalSnapshot = anonymise
  ? redact(snapshot)
  : { ...snapshot, meta: { ...snapshot.meta, dataset: 'real' } }
await writeFile(target, JSON.stringify(out), 'utf8')

const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8')
console.log(
  `Wrote ${target} — ${out.items.length} item lines, ${out.orders.length} orders, ` +
    `${out.customers.length} customers, as at ${out.meta.exportDate}, ` +
    `${(bytes / 1024 / 1024).toFixed(2)} MB.`,
)
console.log(
  anonymise
    ? '  Anonymised: no real customer, project, panel or engineer name remains.'
    : '  REAL CUSTOMER DATA. Upload it somewhere private, and never commit it.',
)

/* ------------------------------------------------------------------------- */

/**
 * Replace identifying strings, keep every number and date.
 *
 * Deterministic, so the same input always yields the same aliases and a demo can
 * be discussed without the mapping shifting underfoot. One-way: the aliases carry
 * no encoding of the original, so this file cannot be turned back.
 */
function redact(s: PortalSnapshot): PortalSnapshot {
  const alias = (prefix: string) => {
    const seen = new Map<string, string>()
    return (value: string | null): string | null => {
      if (value === null || value === '') return value
      const existing = seen.get(value)
      if (existing) return existing
      const made = `${prefix} ${seen.size + 1}`
      seen.set(value, made)
      return made
    }
  }

  const customer = alias('Customer')
  const project = alias('Project')
  const code = alias('PANEL')
  const description = alias('Panel type')
  const manager = alias('Engineer')
  const group = alias('Product group')

  // Sales-order numbers are join keys as well as labels, so the same alias has to
  // reach items, orders and the customers' order lists.
  const orderNumbers = new Map<string, string>()
  s.orders.forEach((o, i) => orderNumbers.set(o.so, `SO-DEMO-${String(i + 1).padStart(4, '0')}`))
  const so = (v: string) => orderNumbers.get(v) ?? v

  const workOrder = (v: string | undefined) =>
    v === undefined
      ? undefined
      : v
          .split(',')
          .map((_, i) => `MFG-WO-DEMO-${String(i + 1).padStart(5, '0')}`)
          .join(', ')

  return {
    meta: {
      ...s.meta,
      dataset: 'anonymised',
      pms: s.meta.pms.map((p) => ({ n: manager(p.n), c: p.c })),
      groups: s.meta.groups.map((g) => ({ n: group(g.n), c: g.c })),
    },
    items: s.items.map((i) => ({
      ...i,
      so: so(i.so),
      proj: project(i.proj)!,
      cust: customer(i.cust)!,
      pm: manager(i.pm),
      grp: group(i.grp),
      code: code(i.code)!,
      name: description(i.name),
      ...(i.wo === undefined ? {} : { wo: workOrder(i.wo)! }),
    })),
    orders: s.orders.map((o) => ({
      ...o,
      so: so(o.so),
      proj: project(o.proj)!,
      cust: customer(o.cust)!,
      pm: manager(o.pm),
    })),
    customers: s.customers.map((c) => ({
      ...c,
      name: customer(c.name)!,
      orders: c.orders.map(so),
    })),
  }
}
