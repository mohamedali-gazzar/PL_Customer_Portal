/**
 * RTL correctness, enforced on the stylesheets.
 *
 * Full RTL is a requirement, and the way it usually breaks is not a missing
 * translation — it is one `margin-left` that does not mirror, so a card is
 * misaligned only in Arabic and nobody notices until a customer does.
 *
 * Every offset in this UI is therefore written as a logical property. This test scans
 * the CSS and fails on physical ones, so the guarantee holds for stylesheets nobody
 * has opened in Arabic.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = path.join(projectRoot, 'src', 'ui')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.css')) out.push(full)
  }
  return out
}

const files = walk(uiRoot).map((full) => ({
  relative: path.relative(projectRoot, full).split(path.sep).join('/'),
  lines: readFileSync(full, 'utf8').split('\n'),
}))

/** Physical properties with a logical equivalent that must be used instead. */
const PHYSICAL = [
  { pattern: /(^|[\s;{])(left|right)\s*:/, fix: 'inset-inline-start / inset-inline-end' },
  { pattern: /margin-(left|right)\s*:/, fix: 'margin-inline-start / margin-inline-end' },
  { pattern: /padding-(left|right)\s*:/, fix: 'padding-inline-start / padding-inline-end' },
  { pattern: /border-(left|right)(-width|-style|-color)?\s*:/, fix: 'border-inline-start / border-inline-end' },
  { pattern: /\btext-align\s*:\s*(left|right)\b/, fix: 'text-align: start / end' },
  { pattern: /(^|[\s;{])(top|bottom)\s*:/, fix: 'inset-block-start / inset-block-end' },
  { pattern: /margin-(top|bottom)\s*:/, fix: 'margin-block-start / margin-block-end' },
  { pattern: /padding-(top|bottom)\s*:/, fix: 'padding-block-start / padding-block-end' },
  { pattern: /\bfloat\s*:\s*(left|right)\b/, fix: 'flex or grid' },
]

describe('stylesheets are direction-agnostic', () => {
  test('the CSS is actually being scanned', () => {
    assert.ok(files.length >= 5, `expected the UI stylesheets, found ${files.length}`)
  })

  test('no physical inset, margin, padding, border or alignment property', () => {
    const offenders: string[] = []

    for (const file of files) {
      let inDirectionOverride = false
      let depth = 0

      file.lines.forEach((raw, index) => {
        const line = raw.split('/*')[0] ?? raw

        // A rule explicitly scoped to one direction is allowed to be physical: the
        // breadcrumb chevron is mirrored deliberately inside `html[dir='rtl']`.
        if (/\[dir=/.test(line)) inDirectionOverride = true
        depth += (line.match(/\{/g) ?? []).length
        depth -= (line.match(/\}/g) ?? []).length
        if (depth <= 0) inDirectionOverride = false
        if (inDirectionOverride) return

        for (const rule of PHYSICAL) {
          if (rule.pattern.test(line)) {
            offenders.push(`${file.relative}:${index + 1} — "${line.trim()}" → use ${rule.fix}`)
          }
        }
      })
    }

    assert.deepEqual(offenders, [], `physical CSS properties break RTL:\n${offenders.join('\n')}`)
  })

  test('logical properties are actually in use, so the scan is not passing vacuously', () => {
    const all = files.flatMap((f) => f.lines).join('\n')
    for (const expected of ['inset-inline-start', 'margin-inline', 'padding-inline', 'border-inline-end', 'text-align: start']) {
      assert.ok(all.includes(expected), `expected ${expected} somewhere in the UI CSS`)
    }
  })

  test('Arabic-specific typography adjustments exist', () => {
    // Arabic at the same optical size needs more leading, and uppercase/letter-spacing
    // are meaningless for the script — both are handled rather than inherited.
    const all = files.flatMap((f) => f.lines).join('\n')
    assert.ok(all.includes("html[lang='ar']"), 'expected Arabic typography overrides')
    assert.ok(/html\[lang='ar'\][\s\S]*text-transform:\s*none/.test(all), 'expected uppercase to be disabled for Arabic')
  })
})
