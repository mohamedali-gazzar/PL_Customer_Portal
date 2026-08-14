/**
 * Everything the server reads from the environment, resolved once, in one place.
 *
 * Configuration is validated at boot rather than at first use, so a missing secret
 * is a startup failure with a sentence explaining it — not a 500 three screens into
 * a customer's session.
 *
 * The defaults are chosen so a deployment works with nothing configured except the
 * session secret. Every value goes through `str()`, which treats blank as absent: a
 * variable defined in a hosting dashboard with an empty value is one of the
 * commonest real deployment states, and `??` alone does not catch it, because
 * `'' ?? 'x'` is `''`.
 */

export type DataProviderName = 'bundled' | 'xlsx' | 'snapshot' | 'erpnext'
export type CacheDriverName = 'memory' | 'upstash'

export interface PortalConfig {
  readonly production: boolean
  readonly provider: DataProviderName
  readonly excelPath: string
  readonly snapshotUrl: string | null
  readonly cacheDriver: CacheDriverName
  readonly upstash: { readonly url: string; readonly token: string } | null
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  readonly snapshotFreshSeconds: number
  readonly snapshotStaleSeconds: number
  /**
   * The sign-in customer picker, and the statistics on the sign-in screen.
   *
   * On by default, because it is currently the only way into the portal: the data
   * has no contact records, so there is no credential to check. Set
   * `PORTAL_DEMO_MODE=0` once logins are provisioned from ERPNext contacts — the
   * picker disappears and the sign-in screen stops publishing figures.
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

/** A blank environment variable means "not set", not "set to empty". */
function str(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : undefined
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  const v = str(raw)
  if (v === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

function int(raw: string | undefined, fallback: number): number {
  const n = Number(str(raw))
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PortalConfig {
  const production = env.NODE_ENV === 'production'

  const provider = (str(env.PORTAL_DATA_PROVIDER) ?? 'bundled').toLowerCase()
  if (provider !== 'bundled' && provider !== 'xlsx' && provider !== 'snapshot' && provider !== 'erpnext') {
    throw new ConfigError(
      `PORTAL_DATA_PROVIDER must be one of these, not "${provider}":\n` +
        `  bundled  — the snapshot committed at content/portal-snapshot.json (default)\n` +
        `  xlsx     — derive from the backlog export on local disk\n` +
        `  snapshot — fetch a derived snapshot over HTTPS\n` +
        `  erpnext  — read the live ERP`,
    )
  }

  const snapshotUrl = str(env.PORTAL_SNAPSHOT_URL) ?? null
  if (provider === 'snapshot' && !snapshotUrl) {
    throw new ConfigError('PORTAL_DATA_PROVIDER=snapshot needs PORTAL_SNAPSHOT_URL.')
  }

  const cacheDriver = (str(env.PORTAL_CACHE_DRIVER) ?? 'memory').toLowerCase()
  if (cacheDriver !== 'memory' && cacheDriver !== 'upstash') {
    throw new ConfigError(`PORTAL_CACHE_DRIVER must be "memory" or "upstash", not "${cacheDriver}".`)
  }

  const upstashUrl = str(env.UPSTASH_REDIS_REST_URL)
  const upstashToken = str(env.UPSTASH_REDIS_REST_TOKEN)
  if (cacheDriver === 'upstash' && !(upstashUrl && upstashToken)) {
    throw new ConfigError(
      'PORTAL_CACHE_DRIVER=upstash needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    )
  }

  const sessionSecret = str(env.PORTAL_SESSION_SECRET)
  if (production && (!sessionSecret || sessionSecret.length < 32)) {
    throw new ConfigError(
      'PORTAL_SESSION_SECRET must be at least 32 random characters in production.\n' +
        'It signs the session cookie. Without it the cookie is signed with a value that ' +
        'is published in this repository, and anyone could mint one naming any customer ' +
        'and read that customer\'s orders. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    )
  }

  const erpBase = str(env.ERPNEXT_BASE_URL)
  const erpKey = str(env.ERPNEXT_API_KEY)
  const erpSecret = str(env.ERPNEXT_API_SECRET)
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
    excelPath: str(env.EXCEL_BACKLOG_PATH) ?? 'data/backlog.xlsx',
    snapshotUrl,
    cacheDriver,
    upstash: upstashUrl && upstashToken ? { url: upstashUrl, token: upstashToken } : null,
    sessionSecret: sessionSecret ?? DEV_SECRET,
    sessionTtlSeconds: int(env.PORTAL_SESSION_TTL_SECONDS, 12 * 60 * 60),
    snapshotFreshSeconds: int(env.PORTAL_SNAPSHOT_FRESH_SECONDS, 5 * 60),
    snapshotStaleSeconds: int(env.PORTAL_SNAPSHOT_STALE_SECONDS, 30 * 60),
    demoMode: bool(env.PORTAL_DEMO_MODE, true),
    erpnext:
      erpBase && erpKey && erpSecret
        ? {
            baseUrl: erpBase.replace(/\/+$/, ''),
            apiKey: erpKey,
            apiSecret: erpSecret,
            timeoutMs: int(env.ERPNEXT_TIMEOUT_MS, 15_000),
          }
        : null,
    staffEmailDomain: (str(env.PORTAL_STAFF_EMAIL_DOMAIN) ?? 'powerline.com.eg').toLowerCase(),
  }
}

let cached: PortalConfig | null = null

export function config(): PortalConfig {
  if (cached === null) cached = loadConfig()
  return cached
}

/** Test support: forget the memoised configuration. */
export function resetConfig(): void {
  cached = null
}
