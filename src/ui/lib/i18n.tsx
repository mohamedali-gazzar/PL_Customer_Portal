'use client'

/**
 * The React side of the interface language: the provider, the hook, and the lookup
 * that falls back to English. The strings themselves are in `./messages`, which is
 * plain TypeScript so the catalogue can be asserted on in a test — this file cannot
 * be, because the runner cannot load JSX.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { usePrefs, type Locale } from './prefs'
import { MESSAGES, type MessageKey } from './messages'

export type { MessageKey }

type Vars = Record<string, string | number>

export type Translate = (key: MessageKey, vars?: Vars) => string

const TContext = createContext<Translate | null>(null)

/**
 * Translate by key, falling back to the English the model already carries.
 *
 * The stage and step models hold both a key and an English word for every label.
 * Where a key is missing or unmapped, showing the English is better than showing
 * the raw key or a blank: the screen stays usable and the gap is visible enough to
 * be reported. Three components needed this and each had grown its own copy.
 */
export function useLabel(): (key: string, fallback: string) => string {
  const t = useT()
  return useCallback(
    (key: string, fallback: string) => {
      if (!key) return fallback
      const out = t(key as MessageKey)
      return out === key ? fallback : out
    },
    [t],
  )
}

export function useT(): Translate {
  const t = useContext(TContext)
  if (!t) throw new Error('useT must be used inside <I18nProvider>')
  return t
}

/** Also exposed for a11y strings that need the current locale directly. */
export function useLocale(): Locale {
  return usePrefs().locale
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = usePrefs()

  const t = useCallback<Translate>(
    (key, vars) => {
      const table = MESSAGES[locale] as Record<string, string>
      // Falling back to English is the honest failure: a missing Arabic string
      // shows the English one rather than a raw key.
      const raw = table[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        vars[name] === undefined ? `{${name}}` : String(vars[name]),
      )
    },
    [locale],
  )

  const value = useMemo(() => t, [t])
  return <TContext.Provider value={value}>{children}</TContext.Provider>
}
