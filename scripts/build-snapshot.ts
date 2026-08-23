/**
 * Derive the portal snapshot from the backlog export.
 *
 *   npm run build:snapshot
 *
 * Reads both PM Phase Cycle Times exports — `data/backlog.xlsx` (Open Backlog) and
 * `data/delivered.xlsx` (Delivered) — and writes
 * `content/portal-snapshot.json`, which ships with the application. That is what a
 * deployment serves until ERPNext is connected.
 *
 * Everything in the output is real: real customers, real projects, real panels,
 * real engineers, real dates and real values. There is no synthetic mode, by
 * decision of the data owner — see docs/DECISIONS.md, D10.
 *
 * When a new export arrives: drop it in, re-run this, commit, push. When ERPNext is
 * connected this script is no longer part of the running system, and the same
 * derivation runs against live documents instead.
 */

import { mkdir, writeFile } from 'node:fs/promises'

import { loadXlsxSnapshot } from '@/providers/xlsx'

const source = process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx'
const delivered = process.env.EXCEL_DELIVERED_PATH ?? 'data/delivered.xlsx'
const target = 'content/portal-snapshot.json'

const { snapshot, warnings } = await loadXlsxSnapshot(source, delivered)
for (const w of warnings) console.warn(`  warning: ${w}`)

await mkdir('content', { recursive: true })
const json = JSON.stringify(snapshot)
await writeFile(target, json, 'utf8')

const topManagers = snapshot.meta.pms
  .slice(0, 3)
  .map((p) => `${p.n ?? 'unassigned'} (${p.c})`)
  .join(', ')

console.log(
  `Wrote ${target}\n` +
    `  ${snapshot.items.length} item lines · ${snapshot.orders.length} orders · ` +
    `${snapshot.customers.length} customers · as at ${snapshot.meta.exportDate}\n` +
    `  ${(Buffer.byteLength(json, 'utf8') / 1024 / 1024).toFixed(2)} MB · ` +
    `project managers: ${topManagers}…`,
)
