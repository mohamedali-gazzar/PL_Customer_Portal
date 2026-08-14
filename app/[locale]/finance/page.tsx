import { getAccountContext } from '@/application/account'
import { getAppDeps } from '@/infra/container'
import { authIsConfigured, currentSession } from '@/infra/session/current'
import { formatDate, parseLocale } from '@/ui/i18n/locale'
import { translator } from '@/ui/i18n/messages'
import { AppShell } from '@/ui/components/shell'
import { Page, PageHead, Unavailable } from '@/ui/components/primitives'
import { SignInRequired } from '@/ui/pages/gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The Finance screen while the source has no financial data.
 *
 * Deliberately not a stub, and deliberately not hidden from the navigation. A
 * customer who clicks Finance is entitled to an explanation of why there is nothing
 * there — hiding the tab would leave them wondering, and showing zeroed tiles would
 * tell them their balance is nil. The screen exists, states what is missing, names
 * the source, and will fill itself in when `capabilities.finance` turns true.
 */
export default async function FinancePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const t = translator(locale)
  const path = '/finance'

  const session = await currentSession()
  if (session === null) {
    return <SignInRequired locale={locale} t={t} active="finance" currentPath={path} authConfigured={authIsConfigured()} />
  }

  const { value: account } = await getAccountContext(getAppDeps(), session.customerId)

  return (
    <AppShell
      locale={locale}
      t={t}
      active="finance"
      customerName={account.customer.displayName === '' ? null : account.customer.displayName}
      source={account.source}
      currentPath={path}
    >
      <Page>
        <PageHead
          title={t('finance.heading')}
          sub={account.source.asOf.known ? t('source.asOf', { date: formatDate(locale, account.source.asOf.value) }) : undefined}
        />
        {account.unavailable.finance !== null && (
          <Unavailable info={account.unavailable.finance} t={t} sourceLabel={sourceLabel(account.source.providerId)} />
        )}
      </Page>
    </AppShell>
  )
}

function sourceLabel(providerId: string): string {
  return `Data source: ${providerId}`
}
