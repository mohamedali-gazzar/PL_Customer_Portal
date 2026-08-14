import type { ReactNode } from 'react'
import type { DataSourceDto } from '@/dto/common'
import { formatDate, otherLocale, type Locale } from '@/ui/i18n/locale'
import type { Translate } from '@/ui/i18n/messages'
import { cn } from '@/ui/cn'
import s from './shell.module.css'

export type NavKey = 'dashboard' | 'projects' | 'finance' | 'documents'

const NAV: { key: NavKey; path: string }[] = [
  { key: 'dashboard', path: 'dashboard' },
  { key: 'projects', path: 'projects' },
  { key: 'finance', path: 'finance' },
  { key: 'documents', path: 'documents' },
]

export function AppShell({
  locale,
  t,
  active,
  customerName,
  source,
  currentPath,
  children,
}: {
  locale: Locale
  t: Translate
  active: NavKey | null
  customerName: string | null
  source: DataSourceDto | null
  /** Path without the locale prefix, used to keep the language switch on the page. */
  currentPath: string
  children: ReactNode
}) {
  const swapped = otherLocale(locale)
  return (
    <>
      <a className={s.skip} href="#main">
        {t('app.skipToContent')}
      </a>

      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href={`/${locale}/dashboard`}>
            <span className={s.brandMark}>{t('app.name')}</span>
            <span className={s.brandSub}>{t('app.portal')}</span>
          </a>

          <nav className={s.nav} aria-label={t('app.portal')}>
            {NAV.map((item) => (
              <a
                key={item.key}
                href={`/${locale}/${item.path}`}
                className={cn(s.navLink, active === item.key && s.navLinkActive)}
                aria-current={active === item.key ? 'page' : undefined}
              >
                {t(`nav.${item.key}`)}
              </a>
            ))}
          </nav>

          <div className={s.headerEnd}>
            <a
              className={s.localeSwitch}
              href={`/${swapped}${currentPath}`}
              lang={swapped}
              aria-label={t('locale.switchLabel')}
            >
              {t('locale.switch')}
            </a>
            {customerName !== null && (
              <div className={s.who}>
                {/* bdi isolates the customer name: 15 of 107 mix Arabic and Latin script. */}
                <bdi className={s.whoName}>{customerName}</bdi>
                <span className={s.avatar} aria-hidden="true">
                  {initials(customerName)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {source !== null && !source.isLive && <DataSourceBanner source={source} locale={locale} t={t} />}

      <main id="main">{children}</main>

      <footer className={s.footer}>
        {t('app.name')} · {t('app.portal')}
      </footer>
    </>
  )
}

function DataSourceBanner({ source, locale, t }: { source: DataSourceDto; locale: Locale; t: Translate }) {
  return (
    <div className={s.banner}>
      <div className={s.bannerInner}>
        <div className={s.bannerRow}>
          <svg className={s.bannerIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className={s.bannerAsOf}>
            {source.asOf.known ? t('source.asOf', { date: formatDate(locale, source.asOf.value) }) : t('source.title')}
          </span>
          <span>{t('source.snapshot')}</span>
          {source.caveat.known && <span className={s.bannerTag}>{t('source.openBacklogOnly')}</span>}

          {/* <details> gives progressive disclosure with no client JavaScript. */}
          <details className={s.bannerDetails}>
            <summary className={s.bannerSummary}>{t('source.whatIsMissing')}</summary>
            <p className={s.bannerBody}>{t('source.missingList')}</p>
          </details>
        </div>
      </div>
    </div>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '?'
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : ''
  return `${first}${second}`.toUpperCase()
}
