/**
 * Everything the server reads from the environment, resolved once, in one place.
 *
 * Configuration is validated at boot rather than at first use, so a missing secret
 * is a startup failure with a sentence explaining it — not a 500 three screens into
 * a customer's session.
 *
 * Every value goes through `str()`, which treats blank as absent. A variable
 * defined in a hosting dashboard with an empty value is one of the commonest real
 * deployment states, and `??` alone does not catch it: `'' ?? 'xlsx'` is `''`.
 */

export type DataProviderName = 'xlsx' | 'snapshot' | 'erpnext'
export type CacheDriverName = 'memory' | 'upstash'

export interface PortalConfig {
  readonly production: boolean
  readonly provider: DataProviderName
  readonly excelPath: string
  /** Where the pre-derived snapshot lives, when the provider is `snapshot`. */
  readonly snapshotUrl: string | null
  readonly cacheDriver: CacheDriverName
  readonly upstash: { readonly url: string; readonly token: string } | null
  readonly sessionSecret: string
  readonly sessionTtlSeconds: number
  readonly snapshotFreshSeconds: number
  readonly snapshotStaleSeconds: number
  /**
   * Demo affordances from the approved prototype: the public statistics strip on
   * the sign-in screen, and the "sign in as any customer" picker.
   *
   * Both present real, commercially sensitive data to an unauthenticated visitor —
   * the company's total backlog, and the name and open value of every customer.
   * They are right for a local walkthrough and wrong on a public URL, which is why
   * this is a flag and not a constant.
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

  const provider = (str(env.PORTAL_DATA_PROVIDER) ?? 'xlsx').toLowerCase()
  if (provider !== 'xlsx' && provider !== 'snapshot' && provider !== 'erpnext') {
    throw new ConfigError(
      `PORTAL_DATA_PROVIDER must be "xlsx", "snapshot" or "erpnext", not "${provider}".\n` +
        `  xlsx     — derive from the PM Phase Cycle Times export on local disk\n` +
        `  snapshot — fetch an already-derived snapshot over HTTPS (use this on Vercel)\n` +
        `  erpnext  — read the live ERP`,
    )
  }

  const snapshotUrl = str(env.PORTAL_SNAPSHOT_URL) ?? null
  if (provider === 'snapshot' && !snapshotUrl) {
    throw new ConfigError(
      'PORTAL_DATA_PROVIDER=snapshot needs PORTAL_SNAPSHOT_URL — the HTTPS location of ' +
        'the file produced by `npm run build:snapshot`.',
    )
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
      'PORTAL_SESSION_SECRET must be at least 32 random characters in production. ' +
        'It signs the session cookie: without it, anyone could mint a cookie naming any ' +
        'customer and read that customer\'s orders. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    )
  }

  const demoMode = bool(env.PORTAL_DEMO_MODE, !production)
  if (production && demoMode && !bool(env.PORTAL_ALLOW_DEMO_IN_PRODUCTION, false)) {
    throw new ConfigError(
      'PORTAL_DEMO_MODE=1 in production publishes the company total backlog and the name ' +
        'and open value of every customer to any unauthenticated visitor.\n' +
        'If this deployment is a private demo, set PORTAL_ALLOW_DEMO_IN_PRODUCTION=1 — and ' +
        'put the deployment behind access protection, because the URL is otherwise public.\n' +
        'Otherwise set PORTAL_DEMO_MODE=0.',
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
    demoMode,
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
