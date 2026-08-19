'use client'

/**
 * The appearance and language controls.
 *
 * Both are segmented controls, because the sign-in screen already establishes that
 * device for a small set of mutually exclusive choices, and because a segmented
 * control shows the options rather than hiding the alternative behind a toggle
 * whose current meaning you have to infer.
 *
 * They live in the header beside the account cluster: a preference about the whole
 * interface belongs to the shell, not to any one screen.
 */

import { usePrefs, type ThemeChoice, type Locale } from '../lib/prefs'
import { useT } from '../lib/i18n'

const Sun = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="8" cy="8" r="3.1" />
    <path d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1" />
  </svg>
)
const Moon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.4 9.9A5.9 5.9 0 0 1 6.1 2.6a5.9 5.9 0 1 0 7.3 7.3z" />
  </svg>
)
const Auto = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 2.4v11.2" />
    <path d="M8 2.4A5.6 5.6 0 0 1 8 13.6z" fill="currentColor" stroke="none" />
  </svg>
)

export function Prefs() {
  const { theme, setTheme, locale, setLocale } = usePrefs()
  const t = useT()

  const themes: { key: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    { key: 'system', label: t('shell.themeSystem'), icon: <Auto /> },
    { key: 'light', label: t('shell.themeLight'), icon: <Sun /> },
    { key: 'dark', label: t('shell.themeDark'), icon: <Moon /> },
  ]

  const locales: { key: Locale; label: string; full: string }[] = [
    { key: 'en', label: 'EN', full: 'English' },
    { key: 'ar', label: 'ع', full: 'العربية' },
  ]

  return (
    <div className="prefs-group">
      <div className="prefs" role="group" aria-label={t('shell.appearance')}>
        {themes.map((o) => (
          <button
            key={o.key}
            className={theme === o.key ? 'on' : undefined}
            onClick={() => setTheme(o.key)}
            aria-pressed={theme === o.key}
            title={o.label}
          >
            {o.icon}
            <span className="sr">{o.label}</span>
          </button>
        ))}
      </div>

      <div className="prefs" role="group" aria-label={t('shell.language')}>
        {locales.map((o) => (
          <button
            key={o.key}
            className={locale === o.key ? 'on lang' : 'lang'}
            onClick={() => setLocale(o.key)}
            aria-pressed={locale === o.key}
            title={o.full}
            lang={o.key}
          >
            {o.label}
            <span className="sr">{o.full}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
