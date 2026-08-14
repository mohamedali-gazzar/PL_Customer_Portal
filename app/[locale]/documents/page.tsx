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

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const t = translator(locale)
  const path = '/documents'

  const session = await currentSession()
  if (session === null) {
    return <SignInRequired locale={locale} t={t} active="documents" currentPath={path} authConfigured={authIsConfigured()} />
  }

  const { value: account } = await getAccountContext(getAppDeps(), session.customerId)

  return (
    <AppShell
      locale={locale}
      t={t}
      active="documents"
      customerName={account.customer.displayName === '' ? null : account.customer.displayName}
      source={account.source}
      currentPath={path}
    >
      <Page>
        <PageHead
          title={t('documents.heading')}
          sub={account.source.asOf.known ? t('source.asOf', { date: formatDate(locale, account.source.asOf.value) }) : undefined}
        />
        {account.unavailable.documents !== null && (
          <Unavailable info={account.unavailable.documents} t={t} sourceLabel={`Data source: ${account.source.providerId}`} />
        )}
      </Page>
    </AppShell>
  )
}
