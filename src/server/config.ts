/**
 * Everything the server reads from the environment, resolved once, in one place.
 *
 * Configuration is validated at boot rather than at first use, so a missing
 * secret is a startup failure with a sentence explaining it — not a 500 three
 * screens into a customer's session.
 */

export type DataProviderName = 'xlsx' | 'erpnext'
export type CacheDriverName = 'memory' | 'upstash'

export interface PortalConfig {
  readonly production: boolean
  readonly provider: DataProviderName
  readonly excelPath: string
  readonly cacheDriver: CacheDriverName
  readonly upstash: { readonly url: string; readonly token: string } | null
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  /** How long a derived snapshot may be served before it is recomputed. */
  readonly snapshotFreshSeconds: number
  readonly snapshotStaleSeconds: number
  /**
   * Demo affordances from the approved prototype: the public statistics strip on
   * the sign-in screen, and the "sign in as any customer" picker.
   *
   * Both are presentation of real, commercially sensitive data to an
   * unauthenticated visitor — the company's total backlog, and the name and open
   * value of all 107 customers. They exist because the prototype is a
   * demonstration, and they are exactly right for a local walkthrough.
   *
   * They must be off before the portal faces the internet, which is why this is a
   * flag and not a constant, and why it refuses to default to on in production.
   */
  readonly demoMode: boolean
  readonly erpnext: ErpNextConfig | null
  readonly staffEmailDomain: string
}

export interface ErpNextConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly apiSecret: string
  readonly timeoutMs: number
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** A development-only session secret, used when none is configured. */
const DEV_SECRET = 'powerline-portal-local-development-secret-not-for-production'

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function int(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PortalConfig {
  const production = env.NODE_ENV === 'production'

  const provider = (env.PORTAL_DATA_PROVIDER ?? 'xlsx').trim().toLowerCase()
  if (provider !== 'xlsx' && provider !== 'erpnext') {
    throw new ConfigError(
      `PORTAL_DATA_PROVIDER must be "xlsx" or "erpnext", not "${provider}". ` +
        `"xlsx" derives the portal from the PM Phase Cycle Times export; ` +
        `"erpnext" reads the live ERP.`,
    )
  }

  const cacheDriver = (env.PORTAL_CACHE_DRIVER ?? 'memory').trim().toLowerCase()
  if (cacheDriver !== 'memory' && cacheDriver !== 'upstash') {
    throw new ConfigError(`PORTAL_CACHE_DRIVER must be "memory" or "upstash", not "${cacheDriver}".`)
  }

  const upstashUrl = env.UPSTASH_REDIS_REST_URL?.trim()
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (cacheDriver === 'upstash' && !(upstashUrl && upstashToken)) {
    throw new ConfigError(
      'PORTAL_CACHE_DRIVER=upstash needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    )
  }

  const sessionSecret = env.PORTAL_SESSION_SECRET?.trim()
  if (production && (!sessionSecret || sessionSecret.length < 32)) {
    throw new ConfigError(
      'PORTAL_SESSION_SECRET must be set to at least 32 random characters in production. ' +
        'It signs the session cookie: without it, anyone could mint a cookie naming ' +
        'any customer and read that customer\'s orders.',
    )
  }

  const demoMode = bool(env.PORTAL_DEMO_MODE, !production)
  if (production && demoMode && !bool(env.PORTAL_ALLOW_DEMO_IN_PRODUCTION, false)) {
    throw new ConfigError(
      'PORTAL_DEMO_MODE=1 in production would publish the company total backlog and ' +
        'the name and open value of every customer to any unauthenticated visitor. ' +
        'Set PORTAL_DEMO_MODE=0, or PORTAL_ALLOW_DEMO_IN_PRODUCTION=1 for a deliberate ' +
        'internal staging deployment.',
    )
  }

  const erpBase = env.ERPNEXT_BASE_URL?.trim()
  const erpKey = env.ERPNEXT_API_KEY?.trim()
  const erpSecret = env.ERPNEXT_API_SECRET?.trim()
  if (provider === 'erpnext' && !(erpBase && erpKey && erpSecret)) {
    throw new ConfigError(
      'PORTAL_DATA_PROVIDER=erpnext needs ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ' +
        'ERPNEXT_API_SECRET. Use the dedicated read-only portal service user from ' +
        'brief §7.2 — never an administrator token.',
    )
  }

  return {
    production,
    provider,
    excelPath: env.EXCEL_BACKLOG_PATH?.trim() || 'data/backlog.xlsx',
    cacheDriver,
    upstash: upstashUrl && upstashToken ? { url: upstashUrl, token: upstashToken } : null,
    sessionSecret: sessionSecret || DEV_SECRET,
    sessionTtlSeconds: int(env.PORTAL_SESSION_TTL_SECONDS, 12 * 60 * 60),
    snapshotFreshSeconds: int(env.PORTAL_SNAPSHOT_FRESH_SECONDS, 5 * 60),
    snapshotStaleSeconds: int(env.PORTAL_SNAPSHOT_STALE_SECONDS, 30 * 60),
    demoMode,
    erpnext:
      erpBase && erpKey && erpSecret
        ? { baseUrl: erpBase.replace(/\/+$/, ''), apiKey: erpKey, apiSecret: erpSecret, timeoutMs: int(env.ERPNEXT_TIMEOUT_MS, 15_000) }
        : null,
    staffEmailDomain: (env.PORTAL_STAFF_EMAIL_DOMAIN ?? 'powerline.com.eg').trim().toLowerCase(),
  }
}

let cached: PortalConfig | null = null

/** The process-wide configuration. */
export function config(): PortalConfig {
  if (cached === null) cached = loadConfig()
  return cached
}

/** Test support: forget the memoised configuration. */
export function resetConfig(): void {
  cached = null
}
