/**
 * Where every displayed fact comes from, and where the source contradicts itself.
 *
 *   npm run provenance
 *
 * Two questions, answered against the real export rather than from the code:
 *
 *   1. For each thing the portal shows, which report column decides it — and is
 *      there a column at all, or is the portal inventing the answer?
 *   2. Where the report's own fields disagree with each other, how many lines are
 *      affected and which ones?
 *
 * The second list is not a bug list for the portal. It is a data report for
 * Powerline: the portal now shows what the export says, so a contradiction in the
 * export is a contradiction on the screen. Repairing it here is what this
 * architecture exists to stop.
 */

import { loadXlsxSnapshot } from '@/providers/xlsx'
import { STAGES, v8StageOf } from '@/portal/milestones'

const { snapshot } = await loadXlsxSnapshot(
  process.env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx',
  process.env.EXCEL_DELIVERED_PATH ?? 'data/delivered.xlsx',
)
const T = snapshot.meta.exportDate

/* ------------------------------------------------------------- provenance -- */

type Src = { shows: string; column: string; how: string }

const SOURCED: readonly Src[] = [
  { shows: 'current stage (number)', column: 'Current Stage #', how: 'read; 10 and 11 mapped onto v8 Delivery' },
  { shows: 'current stage (name)', column: 'Current Stage #', how: 'number → stable key → translated label' },
  { shows: 'current step', column: 'Step Code', how: 'code → stable key → translated label' },
  { shows: 'stage start (current)', column: 'Stage Since', how: 'read, formatted' },
  { shows: 'days in current stage', column: 'Days In Current Stage', how: 'read' },
  { shows: 'on hold', column: 'On Hold', how: 'read; 1 shows the banner' },
  { shows: 'stage status — Completed', column: 'Current Stage #', how: 'stage number is below it' },
  { shows: 'stage status — In Progress', column: 'Current Stage #', how: 'stage number equals it' },
  { shows: 'stage status — Not Started', column: 'Current Stage #', how: 'stage number is above it' },
  { shows: 'step status', column: 'Step Code', how: 'step order against the code, inside the running stage' },
  { shows: 'delivered line — all Completed', column: 'Delivered Qty vs SO Qty', how: 'every unit shipped' },
  { shows: 'stage start (any stage)', column: "the stage's Start field", how: 'read, formatted' },
  { shows: 'stage completion', column: "the stage's End field", how: 'read, formatted' },
  { shows: 'delivered quantity', column: 'Delivered Qty vs SO Qty', how: 'compared, not inferred' },
  { shows: 'contractual date', column: 'Contractual Date', how: 'read, formatted' },
  { shows: 'material outcome', column: 'Main Material Status', how: 'value → stable key → label' },
]

const GAPS: readonly { shows: string; why: string }[] = [
  {
    shows: 'progress percentage',
    why: 'No progress or percent column exists in either export. The figure is computed in the portal from the specification\'s per-stage weights (STAGE_WEIGHTS) applied to Current Stage #. It is a presentation metric defined by the spec, not an ERP value, and must not be described as one.',
  },
  {
    shows: 'FAT invitation',
    why: 'v8 names the step but the field does not exist. FAT Success stands for both, so the two cannot be distinguished.',
  },
  {
    shows: 'when an item went on hold',
    why: 'On Hold is a flag with no timestamp, so the banner cannot say since when, and elapsed times cannot exclude the paused period.',
  },
  {
    shows: 'the date a passed stage finished, on 949 lines',
    why: 'v8 BLOCKER — the ten Work Order date fields were backfilled once and nothing keeps them current. The stage still reads Completed, because Current Stage # says the panel passed it; only the date is missing, and it is omitted rather than invented.',
  },
]

console.log(`\nPROVENANCE — ${snapshot.items.length} lines, as at ${T}\n`)
console.log('  WHAT IS SHOWN                    SOURCE COLUMN                  HOW')
console.log('  ' + '─'.repeat(96))
for (const r of SOURCED) {
  console.log(`  ${r.shows.padEnd(32)} ${r.column.padEnd(30)} ${r.how}`)
}
console.log('\n  DATA / ERP GAPS — no column decides these\n')
for (const g of GAPS) {
  console.log(`  · ${g.shows}`)
  for (const line of g.why.match(/.{1,88}(\s|$)/g) ?? []) console.log(`      ${line.trim()}`)
}

/* ---------------------------------------------------- source contradictions -- */

/*
 * Measured on the export, not on the screen.
 *
 * The portal now takes `current_stage_#` as the frontier, so what it renders is
 * consistent by construction — counting the rendered states would only confirm
 * that the mapping works. What Powerline needs is the disagreement inside the
 * source: where the date columns and the stage column tell different stories.
 * Those are the rows whose dates cannot be trusted for anything, and they are
 * why the portal does not read state from them.
 */

const missingBelow: string[] = []
const stampedAbove: string[] = []
const noStepCode: string[] = []
const noSince: string[] = []

for (const i of snapshot.items) {
  const id = `${i.so} · ${i.code}`
  const current = v8StageOf(i.stage)
  const shipped = i.qty > 0 && i.deliv >= i.qty

  for (const spec of STAGES) {
    const start = spec.steps[0] ? (i.sd[spec.steps[0].startAt] ?? null) : null
    const last = spec.steps[spec.steps.length - 1]
    const end = last ? (i.sd[last.endAt] ?? null) : null

    if (spec.no < current && !start && !end) {
      missingBelow.push(`${id} — stage ${spec.no} ${spec.name} passed, no dates recorded`)
      break
    }
  }
  for (const spec of STAGES) {
    const last = spec.steps[spec.steps.length - 1]
    const end = last ? (i.sd[last.endAt] ?? null) : null
    if (spec.no > current && end && !shipped) {
      stampedAbove.push(`${id} — stage ${spec.no} ${spec.name} dated ${end}, report says ${current}`)
      break
    }
  }
  if (i.stepCode === null && !shipped) noStepCode.push(`${id} — no step_code`)
  if (i.since === null && !shipped) noSince.push(`${id} — no stage_since`)
}

const report = (title: string, rows: string[], note: string) => {
  console.log(`\n  ${String(rows.length).padStart(5)}  ${title}`)
  for (const l of note.match(/.{1,88}(\s|$)/g) ?? []) console.log(`         ${l.trim()}`)
  for (const r of rows.slice(0, 3)) console.log(`           ${r}`)
  if (rows.length > 3) console.log(`           … and ${rows.length - 3} more`)
}

console.log(`\n\nDATA ISSUES IN THE SOURCE — reported, never repaired\n`)
report('lines with a passed stage carrying no dates at all', missingBelow,
  'The v8 BLOCKER. The portal shows these Completed on the report’s authority and ' +
  'simply omits the date. Fixing the stamps would give them their history back.')
report('lines with a date stamped beyond the reported current stage', stampedAbove,
  'A document touched before the panel reached that stage. The portal keeps the ' +
  'stage Not Started; the stray date is not shown as an arrival.')
report('lines with no step_code', noStepCode,
  'Without it the portal cannot tell which step inside the stage is running, and ' +
  'falls back to the first.')
report('lines with no stage_since', noSince,
  'The current stage cannot say when it began.')

console.log(
  `\nThe portal renders the report’s frontier. Nothing above changes what it shows.\n`,
)
