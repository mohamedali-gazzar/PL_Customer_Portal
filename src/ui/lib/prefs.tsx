'use client'

/**
 * Appearance and language.
 *
 * Both are applied to the document element, because both have to be right before
 * the first paint: a theme resolved in React flashes the wrong palette, and a
 * direction resolved in React reflows the whole page.
 *
 * The stored choice arrives as a prop, read from the cookie by the server — see
 * `prefs-cookie.ts` for why it is a cookie and not localStorage. This provider
 * therefore renders the same thing on both sides of hydration; it keeps the document
 * attributes in step afterwards and is the only thing that writes them.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  DEFAULT_PREFS,
  PREFS_COOKIE,
  PREFS_MAX_AGE,
  directionOf,
  resolveTheme,
  serializePrefs,
  type Locale,
  type SidebarMode,
  type StoredPrefs,
  type ThemeChoice,
} from './prefs-cookie'

export type { Locale, SidebarMode, ThemeChoice }

interface Prefs {
  theme: ThemeChoice
  /**
   * What `theme` currently resolves to, once the OS has been consulted.
   *
   * Do not render this. It depends on a media query, so it is the one value here
   * the server cannot know — putting it in markup would reintroduce the hydration
   * mismatch this provider was rebuilt to remove. It exists to drive the document
   * attributes, which sit on an element marked `suppressHydrationWarning`.
   */
  resolvedTheme: 'light' | 'dark'
  locale: Locale
  dir: 'ltr' | 'rtl'
  /** How the sidebar behaves: always open, always a rail, or expanding on hover. */
  sidebar: SidebarMode
  setTheme: (t: ThemeChoice) => void
  setLocale: (l: Locale) => void
  setSidebar: (m: SidebarMode) => void
}

const PrefsContext = createContext<Prefs | null>(null)

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>')
  return ctx
}

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function writePrefs(p: StoredPrefs): void {
  try {
    // `secure` only when it would not make the cookie unwritable: localhost is
    // served over http, and a secure cookie there is silently dropped.
    const secure = window.location.protocol === 'https:' ? '; secure' : ''
    document.cookie =
      `${PREFS_COOKIE}=${encodeURIComponent(serializePrefs(p))}` +
      `; path=/; max-age=${PREFS_MAX_AGE}; samesite=lax${secure}`
  } catch {
    /* preference is session-only if the cookie cannot be written */
  }
}

export function PrefsProvider({
  initial,
  children,
}: {
  /** The stored choice, read from the cookie server-side. */
  initial?: StoredPrefs
  children: ReactNode
}) {
  const start = initial ?? DEFAULT_PREFS
  const [theme, setThemeState] = useState<ThemeChoice>(start.theme)
  const [locale, setLocaleState] = useState<Locale>(start.locale)
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark)
  const [sidebar, setSidebarState] = useState<SidebarMode>(start.sidebar)

  // Follow the OS while the choice is "system" — including a change made after the
  // page loaded, which is what someone toggling their laptop at dusk expects.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    setSystemDark(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = resolveTheme(theme, systemDark)
  const dir = directionOf(locale)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('lang', locale)
    root.setAttribute('dir', dir)
    // Tells the browser which scrollbar and form-control palette to use; without it
    // native controls stay light on a dark page.
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme, locale, dir])

  const setSidebar = useCallback(
    (m: SidebarMode) => {
      setSidebarState(m)
      writePrefs({ theme, locale, sidebar: m })
    },
    [theme, locale],
  )

  const setTheme = useCallback(
    (t: ThemeChoice) => {
      setThemeState(t)
      writePrefs({ theme: t, locale, sidebar })
    },
    [locale, sidebar],
  )

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l)
      writePrefs({ theme, locale: l, sidebar })
    },
    [theme, sidebar],
  )

  const value = useMemo<Prefs>(
    () => ({ theme, resolvedTheme, locale, dir, sidebar, setTheme, setLocale, setSidebar }),
    [theme, resolvedTheme, locale, dir, sidebar, setTheme, setLocale, setSidebar],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}
