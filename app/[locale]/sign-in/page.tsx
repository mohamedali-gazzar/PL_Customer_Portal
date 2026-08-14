import { redirect } from 'next/navigation'
import { authIsConfigured, currentSession } from '@/infra/session/current'
import { parseLocale } from '@/ui/i18n/locale'
import { translator } from '@/ui/i18n/messages'
import { AppShell } from '@/ui/components/shell'
import { Card, EmptyState, Page, PageHead, styles } from '@/ui/components/primitives'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sign-in.
 *
 * Real authentication is M5: the current source has no contact or email records, so
 * no account can be provisioned from it. In production this page says exactly that.
 *
 * In development it offers a plain HTML form that posts an account identifier to the
 * dev session route. No client JavaScript, no account list — the identifiers are
 * opaque hashes that come from `npm run verify`, so this page cannot be used to
 * enumerate customers.
 */
export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const t = translator(locale)

  const session = await currentSession()
  if (session !== null) redirect(`/${locale}/dashboard`)

  return (
    <AppShell locale={locale} t={t} active={null} customerName={null} source={null} currentPath="/sign-in">
      <Page>
        <PageHead title={t('signin.heading')} sub={t('signin.body')} />

        {authIsConfigured() ? (
          <div style={{ maxWidth: '520px' }}>
            <Card>
              <h2 style={{ fontSize: 'var(--text-base)' }}>{t('signin.devHeading')}</h2>
              <p style={{ marginBlockStart: 'var(--s2)', color: 'var(--ink-500)', fontSize: 'var(--text-sm)' }}>
                {t('signin.devBody')}
              </p>
              <form method="post" action="/api/dev/session" style={{ marginBlockStart: 'var(--s4)' }}>
                <label htmlFor="tenant" className={styles.fieldLabel}>
                  {t('signin.accountId')}
                </label>
                <input
                  id="tenant"
                  name="tenant"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="c_…"
                  dir="ltr"
                  style={{
                    display: 'block',
                    width: '100%',
                    marginBlockStart: 'var(--s2)',
                    padding: 'var(--s2) var(--s3)',
                    background: 'var(--surface)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink-900)',
                    font: 'inherit',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
                <input type="hidden" name="redirectTo" value={`/${locale}/dashboard`} />
                <button type="submit" className={styles.button} style={{ marginBlockStart: 'var(--s4)' }}>
                  {t('signin.submit')}
                </button>
              </form>
            </Card>
          </div>
        ) : (
          <EmptyState title={t('signin.notConfigured')} body={t('signin.notConfiguredBody')} />
        )}
      </Page>
    </AppShell>
  )
}
