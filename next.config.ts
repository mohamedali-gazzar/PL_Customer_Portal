import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // exceljs is a Node-only library used exclusively by the temporary Excel
  // data provider. Keeping it external stops Next from trying to bundle it,
  // and makes it obvious that it must never reach a client bundle.
  serverExternalPackages: ['exceljs'],

  // Next infers the workspace root from the nearest lockfile and would pick the one
  // in the user's home directory. Pinning it keeps build traces correct.
  outputFileTracingRoot: import.meta.dirname,
}

export default nextConfig
