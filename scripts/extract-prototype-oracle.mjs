/**
 * Extract the approved prototype's own dataset, to be used as the derivation oracle.
 *
 * `Powerline_Customer_Portal_4.html` is the design the business signed off. It
 * carries the fully-derived dataset inline, so it is not just a picture of the
 * intended UI — it is a complete, authoritative statement of what every status,
 * date and percentage should be for all 480 order lines.
 *
 * `tests/portal/derivation.test.ts` replays the raw export through our own rules
 * and asserts the result equals this file. That is what stops the rewrite from
 * quietly changing a customer-facing status.
 *
 * The output lands in data/, which is gitignored: it is real customer data.
 *
 *   node scripts/extract-prototype-oracle.mjs <path-to-prototype.html>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { argv } from 'node:process'
import path from 'node:path'

const source = argv[2]
if (!source) {
  console.error('usage: node scripts/extract-prototype-oracle.mjs <path-to-prototype.html>')
  process.exit(2)
}

const html = await readFile(source, 'utf8')

const marker = 'const DB = '
const start = html.indexOf(marker)
if (start === -1) {
  console.error(`No "const DB = {...}" block found in ${source}. Is this the right prototype file?`)
  process.exit(1)
}

// The block is a single JSON object literal on one line. Walk the braces rather
// than regex-matching, so a brace inside a string cannot truncate the payload.
let depth = 0
let end = -1
let inString = false
let escaped = false
for (let i = start + marker.length; i < html.length; i += 1) {
  const c = html[i]
  if (inString) {
    if (escaped) escaped = false
    else if (c === '\\') escaped = true
    else if (c === '"') inString = false
    continue
  }
  if (c === '"') inString = true
  else if (c === '{') depth += 1
  else if (c === '}') {
    depth -= 1
    if (depth === 0) {
      end = i + 1
      break
    }
  }
}
if (end === -1) {
  console.error('The DB literal is not balanced — the prototype file looks truncated.')
  process.exit(1)
}

const db = JSON.parse(html.slice(start + marker.length, end))

const out = path.join('data', 'prototype-oracle.json')
await mkdir('data', { recursive: true })
await writeFile(out, JSON.stringify(db), 'utf8')

console.log(
  `Wrote ${out}: ${db.items.length} item lines, ${db.orders.length} orders, ` +
    `${db.customers.length} customers, as at ${db.meta.exportDate}.`,
)
