/**
 * Environment configuration.
 *
 * Read once, validated eagerly, and never read piecemeal from `process.env`
 * elsewhere — so a missing variable fails at startup with a clear message instead
 * of producing a blank screen at request time.
 *
 * Note what is absent: no ERPNext variable is read by any code yet. When the
 * ERPNext provider lands, its credentials belong here, server-side only, and must
 * never be given a `NEXT_PUBLIC_` prefix.
 */

export type ProviderKind = 'excel' | 'erpnext' | 'fixture'
export type CacheDriver = 'memory' | 'upstash'

export interface PortalConfig {
  readonly provider: ProviderKind
  readonly excelPath: string
  readonly cacheDriver: CacheDriver
  readonly cacheFreshMs: number
  readonly cacheStaleMs: number
  readonly isProduction: boolean
  readonly devSessionSecret: string | null
}

function intFromEnv(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number, got ${JSON.stringify(raw)}`)
  }
  return parsed
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PortalConfig {
  const provider = (env.PORTAL_DATA_PROVIDER ?? 'excel') as ProviderKind
  if (!['excel', 'erpnext', 'fixture'].includes(provider)) {
    throw new Error(`PORTAL_DATA_PROVIDER must be excel | erpnext | fixture, got "${provider}"`)
  }

  const cacheDriver = (env.PORTAL_CACHE_DRIVER ?? 'memory') as CacheDriver
  if (!['memory', 'upstash'].includes(cacheDriver)) {
    throw new Error(`PORTAL_CACHE_DRIVER must be memory | upstash, got "${cacheDriver}"`)
  }

  const cacheFreshMs = intFromEnv(env.PORTAL_CACHE_FRESH_MS, 90_000, 'PORTAL_CACHE_FRESH_MS')
  const cacheStaleMs = intFromEnv(env.PORTAL_CACHE_STALE_MS, 900_000, 'PORTAL_CACHE_STALE_MS')
  if (cacheStaleMs < cacheFreshMs) {
    throw new Error('PORTAL_CACHE_STALE_MS must be >= PORTAL_CACHE_FRESH_MS')
  }

  return {
    provider,
    excelPath: env.EXCEL_BACKLOG_PATH ?? 'data/backlog.xlsx',
    cacheDriver,
    cacheFreshMs,
    cacheStaleMs,
    isProduction: env.NODE_ENV === 'production',
    devSessionSecret: env.DEV_SESSION_SECRET ?? null,
  }
}
