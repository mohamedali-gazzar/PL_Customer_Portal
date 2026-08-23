/**
 * Assert the portal's promises against the whole real export.
 *
 *   npm run verify
 *
 * The unit tests fix the behaviour on cases we thought of. This runs the same
 * derivation over every line Powerline actually has and asserts the invariants that
 * must hold for all of them — which is a different question, and the one that has
 * caught the real bugs on this project. 647 delivered lines drew an empty progress
 * bar; 130 fully shipped lines read "Partially delivered (1 of 1)"; a whole category
 * of lines was priced at zero. None of those were visible on a screen anyone opened,
 * and none would have been caught by a fixture.
 *
 * Two kinds of output. A CHECK either passes or fails the run: it is something the
 * portal controls and must never get wrong. A COUNT is reported, not judged — the
 * shape of the data, so the numbers in a review can be read against something.
 */

import { buildBands } from '@/portal/bands'
import { deliveryState } from '@/portal/derive'
import { journeyOf } from '@/portal/journey'
import { scopeToCustomer } from '@/portal/scope'
import { MESSAGES } from '@/ui/lib/messages'
import { loadXlsxSnapshot } from '@/providers/xlsx'
import { CUSTOMER_ITEM_OMITTED, CUSTOMER_ORDER_OMITTED } from '@/portal/types'

const backlog = process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx'
const delivered = process.env.EXCEL_DELIVERED_PATH ?? 'data/delivered.xlsx'

const { snapshot } = await loadXlsxSnapshot(backlog, delivered)
const today = snapshot.meta.exportDate

let failed = 0
const check = (name: string, offenders: readonly string[]) => {
  if (offenders.length === 0) {
    console.log(`  ok    ${name}`)
    return
  }
  failed += 1
  console.log(`  FAIL  ${name} — ${offenders.length}`)
  for (const o of offenders.slice(0, 5)) console.log(`          ${o}`)
  if (offenders.length > 5) console.log(`          … and ${offenders.length - 5} more`)
}
const count = (name: string, n: number | string) => console.log(`  ${String(n).padStart(6)}  ${name}`)

const items = snapshot.items
const id = (i: (typeof items)[number]) => `${i.so} · ${i.code}`

/* ------------------------------------------------------------------ shape -- */

console.log(`\nDataset — ${backlog} + ${delivered}, as at ${today}`)
count('item lines', items.length)
count('sales orders', snapshot.orders.length)
count('customers', snapshot.customers.length)
count('lines with no work order (main_wos = 0)', items.filter((i) => i.mainWos === 0).length)
count('lines with more than one work order', items.filter((i) => i.mainWos > 1).length)
count('lines on hold', items.filter((i) => i.hold > 0).length)
count('lines under modification', items.filter((i) => i.rework > 0).length)
count(
  'partially delivered lines',
  items.filter((i) => deliveryState(i.deliv, i.qty) === 'partial').length,
)
count('fully delivered lines', items.filter((i) => deliveryState(i.deliv, i.qty) === 'delivered').length)
count('over-delivered lines (delivered > ordered)', items.filter((i) => i.deliv > i.qty).length)

const keys = new Map<string, number>()
for (const i of items) keys.set(`${i.so}|${i.code}`, (keys.get(`${i.so}|${i.code}`) ?? 0) + 1)
const dupes = [...keys.entries()].filter(([, n]) => n > 1)
count('duplicate SO+Item keys (ERP-side, reported not merged)', dupes.length)

/* ------------------------------------------------------------- the wire -- */

console.log('\nWhat reaches a browser')

/* Every account's payload, serialised exactly as its page would send it. Sampling
   one account is not enough: a leak can be specific to the lines one customer
   happens to have, and the order-level `next` field only named an ERP document for
   the orders sitting at a stage the export cannot feed. */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ...[...CUSTOMER_ITEM_OMITTED, ...CUSTOMER_ORDER_OMITTED].map(
    (k) => [`field ${k}`, new RegExp(`"${k}":`)] as const,
  ),
  ['invoice wording', /invoice/i],
  ['payment wording', /payment entry|awaiting payment/i],
  ['receivable wording', /receivable|credit note|outstanding amount/i],
  ['rework wording', /rework|disassembl/i],
  ['accounts wording', /pending accounts/i],
]

const exposures: string[] = []
const leaks: string[] = []
let biggest = 0
for (const c of snapshot.customers) {
  const s = scopeToCustomer(snapshot, c.name)
  if (!s) {
    leaks.push(`${c.name}: scopes to nothing`)
    continue
  }
  for (const i of s.items) if (i.cust !== c.name) leaks.push(`${c.name} received a ${i.cust} line`)
  for (const o of s.orders) if (o.cust !== c.name) leaks.push(`${c.name} received order ${o.so}`)

  const payload = JSON.stringify(s)
  biggest = Math.max(biggest, payload.length)
  for (const [what, rx] of FORBIDDEN) {
    const hit = rx.exec(payload)
    if (hit) exposures.push(`${c.name}: ${what} — …${payload.slice(Math.max(0, hit.index - 40), hit.index + 40)}…`)
  }
}

count('accounts whose payload was scanned', snapshot.customers.length)
count('bytes in the largest payload', biggest)
check('no internal field or wording in any account payload', exposures)
check('every account sees only its own lines', leaks)

/* ------------------------------------------------------------ derivation -- */

console.log('\nWhat the screens will say')

const contradictions: string[] = []
const emptyBars: string[] = []
const backwards: string[] = []
const overlaps: string[] = []
const untranslated = new Set<string>()
let outOfSequence = 0
const ar = MESSAGES.ar as Record<string, string>
const en = MESSAGES.en as Record<string, string>

for (const i of items) {
  // 1. A delivered line cannot also be partly delivered.
  const text = i.st[5]?.[1] ?? ''
  const state = deliveryState(i.deliv, i.qty)
  if (state === 'delivered' && text.startsWith('Partially')) contradictions.push(`${id(i)}: "${text}"`)
  if (state === 'partial' && text === 'Delivered') contradictions.push(`${id(i)}: "${text}"`)
  if (/\((\d+(?:\.\d+)?) of \1\)/.test(text)) contradictions.push(`${id(i)}: "${text}"`)

  const stages = journeyOf(i, today)

  // 2. Every stage and step the screens render must have both languages.
  for (const st of stages) {
    for (const k of [st.labelKey, st.teamKey, st.statusKey]) {
      if (k && (!en[k] || !ar[k])) untranslated.add(k)
    }
    for (const sp of st.steps) if (sp.labelKey && (!en[sp.labelKey] || !ar[sp.labelKey])) untranslated.add(sp.labelKey)
  }

  /* 3. One frontier per line, from `current_stage_#`.
        Everything before the reported stage Completed, everything after it Not
        Started, and the v8 pair the only overlap. A break here is a portal defect
        now, not an ERP one: the report decides, so the portal cannot disagree
        with itself. */
  const seq = stages.map((s) => s.state)
  const rank = { done: 0, active: 1, pending: 2 } as const
  let worstSoFar = 0
  for (const st of seq) {
    if (rank[st] < worstSoFar) {
      contradictions.push(`${id(i)}: sequence goes backwards — ${seq.join(' ')}`)
      outOfSequence += 1
      break
    }
    worstSoFar = Math.max(worstSoFar, rank[st])
  }

  // 4. An unrecorded production stage must never claim time.
  for (const st of stages) {
    if (st.unrecorded && (st.days !== null || st.to !== null)) {
      contradictions.push(`${id(i)}: unrecorded ${st.label} claims ${st.days}d`)
    }
  }

  // 5. The bar: every band must be drawable, forward, and not on top of its neighbour.
  /* A bar needs a span, not just a date. Order Creation is a moment — an SO
     created and submitted the same day — so a line whose only dated stage is that
     one legitimately draws nothing, and the card falls back to "Not started · Nd".
     One real line is in that position. */
  const bands = buildBands(i, today)
  const hasSpan = stages.some((s) => s.from && s.to && s.from !== s.to) ||
    stages.some((s) => s.state === 'active' && s.from)
  if (bands.length === 0 && hasSpan) emptyBars.push(id(i))
  let previousEnd = ''
  for (const b of bands) {
    if (b.to < b.from) backwards.push(`${id(i)}: ${b.label} ends before it starts`)
    if (previousEnd && b.from < previousEnd) {
      overlaps.push(`${id(i)}: ${b.label} starts ${b.from}, inside the band ending ${previousEnd}`)
    }
    if (b.to > previousEnd) previousEnd = b.to
  }
}

check('no line contradicts itself about delivery or elapsed time', contradictions)
check('every line with dates draws a bar', emptyBars)
check('no band runs backwards', backwards)
check('no two bands sit on top of each other', overlaps)
check('every rendered label has both languages', [...untranslated])

const awaiting = items.filter((i) => i.stage === 2).length
count('lines awaiting the customer’s approval', awaiting)
count('lines whose stages read out of sequence (must be zero)', outOfSequence)

/* ------------------------------------------------------------- scenarios -- */

/*
 * The bar has to survive every shape of line, not just the common one. Each row
 * below is a real state the export produces; the check is that lines in that state
 * still draw a bar with forward, non-empty bands. An empty scenario is reported so
 * a gap in the data is visible rather than passing silently.
 */
console.log('\nThe bar, per scenario')

const SCENARIOS: readonly (readonly [string, (i: (typeof items)[number]) => boolean])[] = [
  ['normal (work order, in flight)', (i) => i.mainWos === 1 && i.hold === 0 && i.rework === 0 && i.deliv === 0],
  ['awaiting the customer’s approval', (i) => i.stage === 2],
  ['in manufacturing', (i) => i.stage === 6],
  ['under modification', (i) => i.rework > 0],
  ['delivered', (i) => deliveryState(i.deliv, i.qty) === 'delivered'],
  ['partially delivered', (i) => deliveryState(i.deliv, i.qty) === 'partial'],
  ['no work order', (i) => i.mainWos === 0],
  ['on hold', (i) => i.hold > 0],
  ['more than one work order', (i) => i.mainWos > 1],
]

const scenarioFails: string[] = []
for (const [name, match] of SCENARIOS) {
  const group = items.filter(match)
  if (group.length === 0) {
    console.log(`  ${'0'.padStart(6)}  ${name} — none in this export`)
    continue
  }
  let drew = 0
  let bandTotal = 0
  for (const i of group) {
    const bands = buildBands(i, today)
    if (bands.length > 0) drew += 1
    bandTotal += bands.length
    for (const b of bands) {
      if (b.to < b.from) scenarioFails.push(`${name}: ${id(i)} band ${b.label} runs backwards`)
    }
  }
  const stagesWithDates = group.filter((i) => {
    const js = journeyOf(i, today)
    return js.some((s) => s.from && s.to && s.from !== s.to) ||
      js.some((s) => s.state === 'active' && s.from)
  }).length
  if (drew < stagesWithDates) {
    scenarioFails.push(`${name}: ${stagesWithDates - drew} line(s) with dates drew no bar`)
  }
  console.log(
    `  ${String(group.length).padStart(6)}  ${name} — ${drew} drew a bar, ` +
      `${(bandTotal / group.length).toFixed(1)} bands each`,
  )
}
check('every scenario draws a usable bar', scenarioFails)

console.log(
  failed === 0
    ? `\nAll checks passed over ${items.length} real lines.\n`
    : `\n${failed} check(s) failed.\n`,
)
process.exit(failed === 0 ? 0 : 1)
