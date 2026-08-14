import { getProjects } from '@/application/projects'
import { getAppDeps } from '@/infra/container'
import { authIsConfigured, currentSession } from '@/infra/session/current'
import { parseLocale } from '@/ui/i18n/locale'
import { translator } from '@/ui/i18n/messages'
import { AppShell } from '@/ui/components/shell'
import { EmptyState, Page, PageHead, Unavailable } from '@/ui/components/primitives'
import { ProjectsTable } from '@/ui/components/projects-table'
import { SignInRequired } from '@/ui/pages/gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const t = translator(locale)
  const path = '/projects'

  const session = await currentSession()
  if (session === null) {
    return <SignInRequired locale={locale} t={t} active="projects" currentPath={path} authConfigured={authIsConfigured()} />
  }

  const { value: list } = await getProjects(getAppDeps(), session.customerId)

  return (
    <AppShell
      locale={locale}
      t={t}
      active="projects"
      customerName={list.customer.displayName}
      source={list.source}
      currentPath={path}
    >
      <Page>
        <PageHead
          title={t('nav.projects')}
          sub={t('kpi.projectsSuffix', { n: list.projects.length })}
        />

        {list.projects.length === 0 ? (
          <EmptyState title={t('dashboard.noProjects')} body={t('dashboard.noProjectsBody')} />
        ) : (
          <ProjectsTable projects={list.projects} locale={locale} t={t} />
        )}

        {list.unavailable.delivery !== null && (
          <div style={{ marginBlockStart: 'var(--s5)' }}>
            <Unavailable info={list.unavailable.delivery} t={t} compact />
          </div>
        )}
      </Page>
    </AppShell>
  )
}
