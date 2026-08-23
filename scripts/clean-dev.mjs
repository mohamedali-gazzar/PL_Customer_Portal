/**
 * Clear a legacy production build out of `.next` before `next dev` starts.
 *
 * Builds now write to `.next-build` (see next.config.ts), so dev and build no
 * longer collide by construction and this script has nothing left to do on a
 * current checkout. It stays for the one case the split cannot reach: a `.next`
 * left behind by a build from before that change, on a machine that has not
 * cleaned it. `BUILD_ID` is the tell — `next build` writes it, `next dev` never
 * does — so this fires once, on that directory, and costs an `existsSync` after.
 */

import { existsSync, rmSync } from 'node:fs'

if (existsSync('.next/BUILD_ID')) {
  rmSync('.next', { recursive: true, force: true })
  console.log('  cleared a production build out of .next — dev needs its own')
}
