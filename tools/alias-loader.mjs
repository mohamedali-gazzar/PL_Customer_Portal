/**
 * Module resolution for Node's native TypeScript execution.
 *
 * TypeScript resolves `@/*` from `tsconfig.json` and Next.js from its own bundler
 * config, but Node's runtime resolver reads neither — and, unlike a bundler, it
 * also refuses extensionless and directory specifiers. This hook teaches it both,
 * using the compiler's own candidate order, so `node --test` and `npm run verify`
 * execute exactly the source that tsc and Next see. No build step, no second copy.
 *
 * Registered with `--import ./tools/alias-loader.mjs`.
 */

import { register } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcRoot = path.join(projectRoot, 'src')

/** The candidate order tsc uses for an extensionless specifier. */
function firstExistingFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    if (statSync(candidate).isDirectory()) continue
    return candidate
  }
  return null
}

export function resolve(specifier, context, nextResolve) {
  // Project alias.
  if (specifier.startsWith('@/')) {
    const resolved = firstExistingFile(path.join(srcRoot, specifier.slice(2)))
    if (resolved === null) throw new Error(`Cannot resolve "${specifier}" under ${srcRoot}`)
    return { url: pathToFileURL(resolved).href, shortCircuit: true }
  }

  // Relative specifier that Node cannot resolve on its own: extensionless
  // (./model) or a directory (./milestones). Both are normal in TypeScript.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentUrl = context.parentURL
    if (parentUrl !== undefined && parentUrl.startsWith('file:')) {
      const fromDir = path.dirname(fileURLToPath(parentUrl))
      const target = path.resolve(fromDir, specifier)
      if (path.extname(target) === '' || !existsSync(target)) {
        const resolved = firstExistingFile(target)
        if (resolved !== null) return { url: pathToFileURL(resolved).href, shortCircuit: true }
      }
    }
  }

  return nextResolve(specifier, context)
}

register(import.meta.url, pathToFileURL('./'))
