/**
 * Where the interface preferences are stored, and how both sides read them.
 *
 * A cookie rather than localStorage, for one reason: this page is rendered on the
 * server, and localStorage is invisible to it. Reading the choice during the first
 * client render — which is what localStorage forces — makes that render disagree
 * with the server's, and React reports a hydration mismatch and keeps the server's
 * attributes. The theme control then paints as unselected however the visitor set it.
 *
 * Deferring the read to an effect would silence the warning by loading every Arabic
 * visitor's page in English and flipping it after hydration. That is a worse defect
 * than the one it fixes, and it is exactly the flash the boot script exists to stop.
 *
 * A cookie is legible to the server, so the markup is correct in the first response.
 *
 * Deliberately not httpOnly: the boot script reads it before React starts and the
 * controls write it. Nothing here is sensitive — a theme and a language — and it is
 * kept separate from the signed session cookie, which stays httpOnly.
 *
 * No directive at the top of this file: it is imported by a server component and by
 * a client one, so it must belong to neither.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Locale = 'en' | 'ar'
/**
 * How the sidebar behaves.
 *
 *   open   — always expanded, labels visible
 *   rail   — always collapsed to icons
 *   hover  — collapsed, expanding over the page while the pointer is on it
 *
 * Three states rather than a toggle because the third is the one people actually
 * want and cannot express with two: keep my screen wide, but let me read the
 * labels without committing a click.
 */
export type SidebarMode = 'open' | 'rail' | 'hover'

export const PREFS_COOKIE = 'pl_prefs'

/** A year. A preference that has to be restated every visit is not a preference. */
export const PREFS_MAX_AGE = 60 * 60 * 24 * 365

export const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark']
export const LOCALES: readonly Locale[] = ['en', 'ar']
export const SIDEBARS: readonly SidebarMode[] = ['open', 'rail', 'hover']

export interface StoredPrefs {
  theme: ThemeChoice
  locale: Locale
  sidebar: SidebarMode
}

/**
 * "System" is the default and a real choice: someone who set their laptop to dark
 * at 9pm should not have to tell this portal about it as well.
 *
 * The sidebar starts on `hover` for the same reason it exists: it gives the page
 * its full width and still lets a reader see the labels without spending a click.
 * `open` held 246px of every screen from the first visit, and a first visit is
 * exactly when nobody has been told there is a control that would give it back.
 *
 * This is the starting point, not an override. Anyone who has already chosen a
 * mode keeps it — the cookie is read first and only falls back to here.
 */
export const DEFAULT_PREFS: StoredPrefs = { theme: 'system', locale: 'en', sidebar: 'hover' }

/**
 * The cookie is `<theme>.<locale>.<sidebar>` — three known tokens.
 *
 * Every unrecognised shape falls back to the default rather than throwing: this
 * value arrives from the browser, so a truncated cookie, an older format or a
 * hand-edited one are all things that will happen, and none of them should be able
 * to stop the page rendering.
 */
export function parsePrefs(raw: string | undefined | null): StoredPrefs {
  const parts = (raw ?? '').split('.')
  const theme = parts[0] ?? ''
  const locale = parts[1] ?? ''
  // Absent on every cookie written before the sidebar had a mode, which is why
  // each token is validated on its own rather than the string as a whole.
  const sidebar = parts[2] ?? ''
  return {
    theme: (THEMES as readonly string[]).includes(theme)
      ? (theme as ThemeChoice)
      : DEFAULT_PREFS.theme,
    locale: (LOCALES as readonly string[]).includes(locale)
      ? (locale as Locale)
      : DEFAULT_PREFS.locale,
    sidebar: (SIDEBARS as readonly string[]).includes(sidebar)
      ? (sidebar as SidebarMode)
      : DEFAULT_PREFS.sidebar,
  }
}

export function serializePrefs(p: StoredPrefs): string {
  return `${p.theme}.${p.locale}.${p.sidebar}`
}

/** What a stored choice resolves to, given what the OS says. */
export function resolveTheme(theme: ThemeChoice, systemDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

/**
 * Runs before the first paint, inlined in the document head.
 *
 * The server can render the stored theme and language, so this is no longer what
 * makes them right — it is what resolves "system", which depends on a media query
 * only the browser can answer. Kept small and dependency-free for that reason.
 */
export const PREFS_BOOT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|; )${PREFS_COOKIE}=([^;]*)/);
var p=(m?decodeURIComponent(m[1]):'').split('.');
var t=p[0]||'system',l=p[1]||'en';
var r=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
var d=document.documentElement;
d.setAttribute('data-theme',r);d.setAttribute('lang',l);
d.setAttribute('dir',l==='ar'?'rtl':'ltr');d.style.colorScheme=r;
}catch(e){}})();`
