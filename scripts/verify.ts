/**
 * Verification run against the real backlog export.
 *
 * Deliberately not part of `npm test`: the automated suite runs on synthetic
 * fixtures so no real customer data can enter Git or CI. This script is how the
 * real file gets exercised locally — it re-derives the numbers from the discovery
 * report, so a mismatch means either the export changed or the adapter is wrong.
 *
 *   npm run verify
 */

import { readFileSync } from 'node:fs'
import {
  buildTimeline,
  isKnown,

  STAGE_IDS,
  type Maybe,
  type ProviderCapabilities,
  type StageId,
} from '@/domain'
import { getDashboard } from '@/application/dashboard'
import { getProjectDetail } from '@/application/project-detail'
import { findForbiddenKeys } from '@/dto/forbidden-keys'
import { TenantCache } from '@/infra/cache/tenant-cache'
import { MemoryCacheStore } from '@/infra/cache/memory-store'
import { SystemClock } from '@/infra/clock'
import { NULL_LOGGER } from '@/infra/logger'
import { withMetrics } from '@/infra/metrics/instrumented-provider'
import { withRequestMetrics } from '@/infra/metrics/request-metrics'
import { ExcelBacklogProvider, hashTenantForLogs } from '@/providers'

/* Load .env.local by hand — no dependency, and this script is the only consumer. */
try {
  for (const raw of readFileSync('.env.local', 'utf8').split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim()
  }
} catch {
  // No .env.local: fall through to defaults and the error below if the path is wrong.
}

const filePath = process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx'

const bold = (s: string) => `[1m${s}[0m`
const dim = (s: string) => `[2m${s}[0m`
const heading = (s: string) => `\n${bold(`── ${s} ${'─'.repeat(Math.max(0, 66 - s.length))}`)}`

function show<T>(m: Maybe<T>): string {
  return isKnown(m) ? String(m.value) : dim(`unknown (${m.reason})`)
}

/** The DTO form of the same thing — `{ known }` on the wire, `{ state }` in the domain. */
function showDto<T>(m: { known: true; value: T } | { known: false; reason: string }): string {
  return m.known ? String(m.value) : dim(`unavailable (${m.reason})`)
}

const provider = new ExcelBacklogProvider({ filePath })
const instrumented = withMetrics(provider)

console.log(heading('Data source'))
const snapshot = await provider.inspect()
const capabilities: ProviderCapabilities = provider.capabilities()

console.log(`file                 ${filePath}`)
console.log(`parse time           ${snapshot.loadMs} ms  ${dim('(once per process)')}`)
console.log(`as-of (from data)    ${show(snapshot.asOf)}`)
console.log(`rows                 ${snapshot.stats.rows}`)
console.log(`customers            ${snapshot.stats.customers}`)
console.log(`projects             ${snapshot.stats.projects}`)
console.log(`order lines          ${snapshot.stats.lines}`)
console.log(`lines w/ production  ${snapshot.stats.linesWithProduction}`)
for (const warning of snapshot.warnings) console.log(dim(`warning: ${warning}`));

/* ─────────────── capability declaration ─────────────── */

console.log(heading('Declared capabilities'))
const stageAvailability: Record<StageId, string> = {
  1: capabilities.drawings ? 'derivable' : 'unavailable',
  2: capabilities.materialStatus ? 'derivable' : 'unavailable',
  3: capabilities.manufacturing ? 'derivable' : 'unavailable',
  4: capabilities.fatEvents ? 'derivable' : 'partial (no FAT outcome)',
  5: capabilities.finance !== false ? 'derivable' : 'unavailable',
  6: capabilities.deliveryEvents ? 'derivable' : 'unavailable',
  7: capabilities.finance !== false ? 'derivable' : 'unavailable',
}
for (const stage of STAGE_IDS) console.log(`stage ${stage}              ${stageAvailability[stage]}`)
console.log(`finance module        ${capabilities.finance === false ? 'unavailable' : 'available'}`)
console.log(`documents module      ${capabilities.documents ? 'available' : 'unavailable'}`)
console.log(`scope                 ${capabilities.scope}`)

/* ─────────────── stage distribution across every line ─────────────── */

console.log(heading('Stage distribution over every order line'))
const today = new SystemClock().today()
const counts: Record<StageId, Map<string, number>> = {
  1: new Map(), 2: new Map(), 3: new Map(), 4: new Map(), 5: new Map(), 6: new Map(), 7: new Map(),
}
let awaitingCustomer = 0
let derivableLines = 0

for (const project of snapshot.projectById.values()) {
  for (const line of project.lines) {
    const timeline = buildTimeline(line, capabilities, today)
    if (timeline.progressBasis.length > 0) derivableLines += 1
    if (isKnown(timeline.blockedOnCustomer)) awaitingCustomer += 1
    for (const stage of STAGE_IDS) {
      const milestone = timeline.milestones[stage]
      const label = isKnown(milestone.status)
        ? `${milestone.status.value} (${milestone.derivation})`
        : `unavailable (${milestone.status.reason})`
      counts[stage].set(label, (counts[stage].get(label) ?? 0) + 1)
    }
  }
}

for (const stage of STAGE_IDS) {
  const rows = [...counts[stage].entries()].sort((a, b) => b[1] - a[1])
  console.log(`\nstage ${stage}`)
  for (const [label, n] of rows) console.log(`   ${String(n).padStart(4)}  ${label}`)
}
console.log(`\nlines with at least one derivable stage   ${derivableLines} / ${snapshot.stats.lines}`)
console.log(`lines awaiting the customer's approval    ${awaitingCustomer}`)

/* ─────────────── adapter diagnostics ─────────────── */

console.log(heading('Adapter diagnostics (data quality, surfaced not hidden)'))
const d = snapshot.diagnostics
console.log(`unmapped work order statuses   ${JSON.stringify(d.unmappedWorkOrderStatuses)}`)
console.log(`unmapped material statuses     ${JSON.stringify(d.unmappedMaterialStatuses)}`)
console.log(`rows with several work orders   ${d.rowsWithMultipleWorkOrders}`)
console.log(`lines with no production        ${d.linesWithoutProduction}`)
console.log(`rows with no contractual date   ${d.rowsWithoutContractualDate}`)
console.log(`out-of-order source dates       ${d.negativeCycleTimes}`)
console.log(`as-of disagreements             ${d.asOfDisagreements}`)
console.log(`line-key collisions             ${d.duplicateLineKeys.length}`)
if (d.inconsistentProjectFields.length > 0) {
  console.log(`inconsistent per-order fields   ${d.inconsistentProjectFields.length}`)
  for (const note of d.inconsistentProjectFields.slice(0, 5)) console.log(dim(`   ${note}`))
}

/* ─────────────── read models + performance ─────────────── */

console.log(heading('Read models and performance'))

// Largest tenant, so the numbers reflect the heaviest realistic request.
const tenants = [...snapshot.projectsByCustomer.entries()].sort(
  (a, b) => b[1].reduce((n, p) => n + p.lines.length, 0) - a[1].reduce((n, p) => n + p.lines.length, 0),
)
const [biggestTenant, itsProjects] = tenants[0]!
const lineCount = itsProjects.reduce((n, p) => n + p.lines.length, 0)

const store = new MemoryCacheStore()
const deps = {
  provider: instrumented,
  cache: new TenantCache(store, { freshMs: 90_000, staleMs: 900_000 }),
  clock: new SystemClock(),
  logger: NULL_LOGGER,
}

console.log(
  `largest tenant        ${hashTenantForLogs(biggestTenant)} ${dim(`(${itsProjects.length} projects, ${lineCount} lines)`)}`,
)

const cold = await withRequestMetrics({ route: 'dashboard' }, () => getDashboard(deps, biggestTenant))
const warm = await withRequestMetrics({ route: 'dashboard' }, () => getDashboard(deps, biggestTenant))

console.log(`\ndashboard cold        ${cold.metrics.totalMs} ms · ${cold.metrics.providerCalls} provider calls · ${cold.value.outcome}`)
console.log(`dashboard warm        ${warm.metrics.totalMs} ms · ${warm.metrics.providerCalls} provider calls · ${warm.value.outcome}`)

// The biggest project in the whole export — the N+1 stress case.
const biggestProject = [...snapshot.projectById.values()].sort((a, b) => b.lines.length - a.lines.length)[0]!
const owner = snapshot.ownerByProject.get(biggestProject.id)!

const detailCold = await withRequestMetrics({ route: 'project-detail' }, () =>
  getProjectDetail(deps, owner, biggestProject.id),
)
const detailWarm = await withRequestMetrics({ route: 'project-detail' }, () =>
  getProjectDetail(deps, owner, biggestProject.id),
)

console.log(
  `\nlargest project       ${biggestProject.salesOrderNo} ${dim(`(${biggestProject.lines.length} lines)`)}`,
)
console.log(`detail cold           ${detailCold.metrics.totalMs} ms · ${detailCold.metrics.providerCalls} provider calls · ${detailCold.value.outcome}`)
console.log(`detail warm           ${detailWarm.metrics.totalMs} ms · ${detailWarm.metrics.providerCalls} provider calls · ${detailWarm.value.outcome}`)

// N+1 check on real data: a 27-line project must cost what a 1-line project costs.
const smallestProject = [...snapshot.projectById.values()].sort((a, b) => a.lines.length - b.lines.length)[0]!
const smallOwner = snapshot.ownerByProject.get(smallestProject.id)!
const small = await withRequestMetrics({ route: 'project-detail' }, () =>
  getProjectDetail({ ...deps, cache: new TenantCache(new MemoryCacheStore(), { freshMs: 1, staleMs: 2 }) }, smallOwner, smallestProject.id),
)
console.log(
  `\nN+1 check             ${biggestProject.lines.length}-line project: ${detailCold.metrics.providerCalls} calls · ` +
    `${smallestProject.lines.length}-line project: ${small.metrics.providerCalls} calls ` +
    (detailCold.metrics.providerCalls === small.metrics.providerCalls ? '✓ flat' : '✗ SCALES WITH ITEMS'),
)

/* ─────────────── full-portfolio sweep ─────────────── */

console.log(heading('Full sweep — every tenant, every project'))
let sweepCalls = 0
let sweepMs = 0
let payloads = 0
let leaks: string[] = []

for (const [tenant] of tenants) {
  const fresh = {
    ...deps,
    cache: new TenantCache(new MemoryCacheStore(), { freshMs: 90_000, staleMs: 900_000 }),
  }
  const run = await withRequestMetrics({ route: 'dashboard' }, () => getDashboard(fresh, tenant))
  sweepCalls += run.metrics.providerCalls
  sweepMs += run.metrics.totalMs
  payloads += 1
  leaks = leaks.concat(findForbiddenKeys(run.value.value).map((h) => `dashboard/${hashTenantForLogs(tenant)}: ${h}`))
}

for (const project of snapshot.projectById.values()) {
  const tenant = snapshot.ownerByProject.get(project.id)!
  const detail = await getProjectDetail(deps, tenant, project.id)
  payloads += 1
  leaks = leaks.concat(findForbiddenKeys(detail.value).map((h) => `${project.salesOrderNo}: ${h}`))
}

console.log(`payloads composed     ${payloads}`)
console.log(`provider calls        ${sweepCalls} for ${tenants.length} cold dashboards ${dim(`(${(sweepCalls / tenants.length).toFixed(1)} per screen)`)}`)
console.log(`total time            ${sweepMs} ms`)
console.log(
  `blacklisted fields    ${leaks.length === 0 ? '0 ✓' : `${leaks.length} ✗`}`,
)
for (const leak of leaks.slice(0, 10)) console.log(`   ${leak}`)

/* ─────────────── a real payload, abridged ─────────────── */

console.log(heading('Sample dashboard payload (largest tenant, abridged)'))
const sample = cold.value.value
console.log(`customer              ${sample.customer.displayName}`)
console.log(`source as-of          ${showDto(sample.source.asOf)} · live: ${sample.source.isLive}`)
console.log(`active projects       ${sample.summary.activeProjects}`)
console.log(`items total           ${sample.summary.itemsTotal}`)
console.log(`in manufacturing      ${sample.summary.itemsInManufacturing}`)
console.log(`mfg complete          ${sample.summary.itemsCompletedManufacturing}`)
console.log(`awaiting approval     ${sample.summary.awaitingYourApproval}`)
console.log(`past contractual      ${sample.summary.projectsPastContractualDate}`)
console.log(
  `items delivered       ${sample.summary.itemsDelivered.known ? sample.summary.itemsDelivered.value : dim(`unavailable (${sample.summary.itemsDelivered.reason})`)}`,
)
console.log(`unavailable blocks    ${JSON.stringify(sample.unavailable)}`)

const card = sample.projects[0]
if (card !== undefined) {
  console.log(`\nfirst project card`)
  console.log(`   ${card.salesOrderNo} · ${card.displayName}`)
  console.log(`   PM              ${card.projectManager.known ? card.projectManager.value : dim('unavailable')}`)
  console.log(`   PO number       ${card.customerPoNo.known ? card.customerPoNo.value : dim(`unavailable (${card.customerPoNo.reason})`)}`)
  console.log(
    `   progress        ${card.progress.percent.known ? `${card.progress.percent.value}% of stages ${card.progress.basis.join(',')}` : dim('unavailable')} ` +
      dim(`(${card.progress.linesCounted}/${card.progress.linesTotal} lines counted)`),
  )
  console.log(
    `   schedule        ${card.schedule.known ? `${card.schedule.value.state}, ${card.schedule.value.daysToContractual}d` : dim(`unavailable (${card.schedule.reason})`)}`,
  )
  console.log(
    `   next milestone  ${card.nextMilestone.known ? `stage ${card.nextMilestone.value.stage} ${card.nextMilestone.value.key}, planned ${card.nextMilestone.value.plannedOn.known ? card.nextMilestone.value.plannedOn.value : 'unknown'}` : dim('none')}`,
  )
}

console.log(heading('Dev session ids (for exercising the API)'))
console.log(dim('POST /api/dev/session with { "tenant": "<id>" } to get a cookie.'))
for (const [tenant, projects] of tenants.slice(0, 3)) {
  console.log(`   ${tenant}  ${dim(`${projects.length} projects, ${projects.reduce((n, p) => n + p.lines.length, 0)} lines`)}`)
}

console.log(`\n${leaks.length === 0 ? bold('VERIFY OK') : bold('VERIFY FAILED — blacklisted fields present')}\n`)
if (leaks.length > 0) process.exit(1)
