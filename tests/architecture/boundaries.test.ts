/**
 * Layer boundaries, enforced by the build.
 *
 * "Keep business logic isolated and testable" and "do not tightly couple the portal
 * to Excel" are only true as long as nobody adds the wrong import. Rather than an
 * ESLint plugin (which would need its own native toolchain), this walks the source
 * and checks each file's imports against the layer it lives in.
 *
 * The rule that matters most: nothing outside `src/providers` may import from
 * `src/providers`, except the composition root. That is what makes the Excel →
 * ERPNext swap a provider change rather than a refactor.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const srcRoot = path.join(projectRoot, 'src')

type Layer = 'domain' | 'ports' | 'dto' | 'providers' | 'infra' | 'application' | 'ui'

/** Which `@/<layer>` imports each layer may use, besides itself. */
const ALLOWED: Record<Layer, Layer[]> = {
  domain: [],
  ports: ['domain'],
  dto: ['domain'],
  providers: ['domain', 'ports'],
  infra: ['domain', 'ports'],
  application: ['domain', 'ports', 'dto'],
  /*
   * The UI sees the wire types and nothing else. It cannot reach a provider, a
   * composer, the cache or the environment — which is what keeps "swap the data
   * source" from becoming "touch the screens", and what stops a component reading a
   * domain entity that still carries internal fields.
   */
  ui: ['dto'],
}

/**
 * The single documented exception: composers record their own compose time through
 * the ambient metrics recorder. Observability is cross-cutting, and the alternative
 * — threading a recorder through every signature — would be worse. Listing it here
 * keeps it deliberate and reviewable rather than accidental.
 */
const EXCEPTIONS: { file: RegExp; import: string; why: string }[] = [
  {
    file: /^application\//,
    import: '@/infra/metrics/request-metrics',
    why: 'ambient observability is cross-cutting',
  },
  {
    // The composition root exists precisely to know about every layer.
    file: /^infra\/container\.ts$/,
    import: '@/providers',
    why: 'composition root selects the active provider',
  },
  {
    file: /^infra\/container\.ts$/,
    import: '@/application/deps',
    why: 'composition root assembles the dependency bundle it is asked for',
  },
  {
    file: /^infra\/(http\/handler|session\/dev-session)\.ts$/,
    import: '@/providers',
    why: 'tenant hashing helper lives with the identity derivation it mirrors',
  },
  {
    file: /^providers\/fixture\/provider\.ts$/,
    import: '@/providers',
    why: 'the fixture deliberately mirrors the Excel capability set',
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Comments discuss Excel, ERPNext and NEXT_PUBLIC_ at length; only code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Import specifiers, from code only.
 *
 * Anchored at line start so prose containing the word "export" cannot be mistaken
 * for a statement, and comments are stripped first for the same reason.
 */
function importsOf(code: string): string[] {
  const specifiers: string[] = []
  const pattern =
    /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(code)) !== null) {
    const specifier = match[1] ?? match[2]
    if (specifier !== undefined) specifiers.push(specifier)
  }
  return specifiers
}

const files = walk(srcRoot).map((full) => {
  const source = readFileSync(full, 'utf8')
  return {
    relative: path.relative(srcRoot, full).split(path.sep).join('/'),
    layer: path.relative(srcRoot, full).split(path.sep)[0] as Layer,
    source,
    code: stripComments(source),
  }
})

describe('layer dependencies', () => {
  test('the source tree is actually being scanned', () => {
    assert.ok(files.length > 20, `expected to scan the source tree, found ${files.length} files`)
  })

  test('no layer imports a layer it may not', () => {
    const violations: string[] = []

    for (const file of files) {
      const allowed = ALLOWED[file.layer]
      if (allowed === undefined) continue

      for (const specifier of importsOf(file.code)) {
        if (!specifier.startsWith('@/')) continue
        const target = specifier.slice(2).split('/')[0] as Layer

        // A layer may always import itself.
        if (target === file.layer) continue
        if (allowed.includes(target)) continue

        const excused = EXCEPTIONS.some(
          (e) => e.file.test(file.relative) && specifier.startsWith(e.import),
        )
        if (excused) continue

        violations.push(`${file.relative} (${file.layer}) → ${specifier}`)
      }
    }

    assert.deepEqual(violations, [], `layer violations:\n${violations.join('\n')}`)
  })
})

describe('the domain is pure', () => {
  test('it imports nothing outside itself', () => {
    const bad: string[] = []
    for (const file of files.filter((f) => f.layer === 'domain')) {
      for (const specifier of importsOf(file.code)) {
        const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
        const isSelf = specifier.startsWith('@/domain')
        if (!isRelative && !isSelf) bad.push(`${file.relative} → ${specifier}`)
      }
    }
    assert.deepEqual(bad, [], `the domain must not depend on anything:\n${bad.join('\n')}`)
  })

  test('it does no I/O and does not read the clock', () => {
    const bad: string[] = []
    for (const file of files.filter((f) => f.layer === 'domain')) {
      // Every rule takes `today` as an argument; a Date.now() here would make the
      // stage rules untestable and time-dependent.
      if (/\bDate\.now\(|new Date\(\)|process\.env|require\(|node:fs|node:crypto/.test(file.code)) {
        bad.push(file.relative)
      }
    }
    assert.deepEqual(bad, [], `impure domain files:\n${bad.join('\n')}`)
  })
})

describe('Excel is not load-bearing', () => {
  test('only the composition root reaches for a concrete provider', () => {
    const offenders = files
      .filter((f) => f.layer !== 'providers')
      .filter((f) => !/^infra\/(container|http\/handler|session\/dev-session)\.ts$/.test(f.relative))
      .filter((f) => importsOf(f.code).some((s) => s.startsWith('@/providers')))
      .map((f) => f.relative)

    assert.deepEqual(
      offenders,
      [],
      `these files would break the Excel → ERPNext swap:\n${offenders.join('\n')}`,
    )
  })

  test('no layer above providers mentions exceljs or a spreadsheet concept', () => {
    const offenders = files
      .filter((f) => f.layer !== 'providers')
      // `.xlsx` is deliberately absent from this list: a configurable file path in
      // infra/config.ts is fine. What must not leak upward is spreadsheet *API* use.
      .filter((f) => /exceljs|worksheet|getCell|eachRow|getWorksheet/i.test(f.code))
      .map((f) => f.relative)
    assert.deepEqual(offenders, [], `spreadsheet knowledge leaked upward:\n${offenders.join('\n')}`)
  })

  test('the ERPNext credential names appear nowhere but config and documentation', () => {
    const offenders = files
      .filter((f) => !/^infra\/config\.ts$/.test(f.relative))
      .filter((f) => /ERPNEXT_API_KEY|ERPNEXT_API_SECRET/.test(f.code))
      .map((f) => f.relative)
    assert.deepEqual(offenders, [], `credential names must not spread:\n${offenders.join('\n')}`)
  })

  test('no NEXT_PUBLIC_ variable is introduced', () => {
    // Anything so prefixed is inlined into the browser bundle. No portal value
    // needs that, and a credential given the prefix by mistake would be published.
    const offenders = files.filter((f) => /NEXT_PUBLIC_/.test(f.code)).map((f) => f.relative)
    assert.deepEqual(offenders, [], `NEXT_PUBLIC_ found in:\n${offenders.join('\n')}`)
  })
})

describe('TypeScript syntax stays portable', () => {
  test('no parameter properties, enums, namespaces or decorators', () => {
    // Node's native type stripping (this project's test and script runner) rejects
    // all four. Keeping to the portable subset means tsc, Next/SWC and Node all
    // accept the same source with no build step in between.
    const offenders: string[] = []
    for (const file of files) {
      const stripped = file.code
      if (/constructor\s*\([^)]*\b(private|public|protected|readonly)\s/.test(stripped)) {
        offenders.push(`${file.relative}: parameter property`)
      }
      if (/^\s*(export\s+)?(const\s+)?enum\s+/m.test(stripped)) offenders.push(`${file.relative}: enum`)
      if (/^\s*(export\s+)?namespace\s+/m.test(stripped)) offenders.push(`${file.relative}: namespace`)
      if (/^\s*@[A-Za-z]/m.test(stripped)) offenders.push(`${file.relative}: decorator`)
    }
    assert.deepEqual(offenders, [], offenders.join('\n'))
  })
})
