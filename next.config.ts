import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The dev-only Next badge sits bottom-left, which is exactly where the sidebar
  // puts the account block — it covered the sign-out control. Nothing is lost by
  // hiding it: it never ships to production, and the build output already says
  // everything it does.
  devIndicators: false,

  // exceljs is a Node-only library used exclusively by the temporary Excel
  // data provider. Keeping it external stops Next from trying to bundle it,
  // and makes it obvious that it must never reach a client bundle.
  serverExternalPackages: ['exceljs'],

  // Next infers the workspace root from the nearest lockfile and would pick the one
  // in the user's home directory. Pinning it keeps build traces correct.
  outputFileTracingRoot: import.meta.dirname,
}

/*
 * `next build` and `next dev` must not share an output directory.
 *
 * They write incompatible things into it, and neither notices the other. A build
 * run while a dev server is up pulls that server's chunks out from under it: the
 * server keeps serving a chunk map whose files are gone and answers 500, or dies
 * with `Cannot find module './873.js'` — a message that names nothing real. It
 * cost this project four incidents, the last one a build run against a dev server
 * the builder did not know was running.
 *
 * Separating the directories ends it. Dev owns `.next`, everything else owns
 * `.next-build`, and a build can now run at any time without touching a live
 * server. `next start` reads the build output, so it belongs on the build side.
 */
export default (phase: string): NextConfig => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next' : '.next-build',
})
