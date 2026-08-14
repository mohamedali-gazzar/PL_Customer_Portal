import type { Locale } from '@/ui/i18n/locale'
import type { Translate } from '@/ui/i18n/messages'
import { AppShell, type NavKey } from '@/ui/components/shell'
import { EmptyState, LinkButton, Page } from '@/ui/components/primitives'

/**
 * What an unauthenticated visitor sees.
 *
 * The chrome still renders, so the page looks like the portal rather than an error,
 * but no read model is fetched — an unauthenticated request costs zero provider
 * calls. The copy distinguishes "your session ended" from "sign-in does not exist
 * yet", because in this phase the second is the real answer.
 */
export function SignInRequired({
  locale,
  t,
  active,
  currentPath,
  authConfigured,
}: {
  locale: Locale
  t: Translate
  active: NavKey | null
  currentPath: string
  /** Passed in: the UI layer reads no environment of its own. */
  authConfigured: boolean
}) {
  const configured = authConfigured
  return (
    <AppShell
      locale={locale}
      t={t}
      active={active}
      customerName={null}
      source={null}
      currentPath={currentPath}
    >
      <Page>
        <EmptyState
          title={configured ? t('signin.required') : t('signin.notConfigured')}
          body={configured ? t('signin.requiredBody') : t('signin.notConfiguredBody')}
        />
        {configured && (
          <p style={{ marginBlockStart: 'var(--s4)', textAlign: 'center' }}>
            <LinkButton href={`/${locale}/sign-in`}>{t('signin.heading')}</LinkButton>
          </p>
        )}
      </Page>
    </AppShell>
  )
}
