import { getDashboard } from '@/application/dashboard'
import { getAppDeps } from '@/infra/container'
import { authIsConfigured, currentSession } from '@/infra/session/current'
import { parseLocale } from '@/ui/i18n/locale'
import { translator } from '@/ui/i18n/messages'
import { AppShell } from '@/ui/components/shell'
import {
  Card,
  EmptyState,
  Page,
  PageHead,
  SectionHead,
  Tile,
  TileRow,
  Unavailable,
  VoidTile,
} from '@/ui/components/primitives'
import { ProjectCard, ProjectGrid } from '@/ui/components/project-card'
import { SignInRequired } from '@/ui/pages/gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rendered on the server from the cached read model.
 *
 * The browser receives HTML, makes no API call and orchestrates nothing — a warm
 * render is one cache read and no provider call at all. This is the same guarantee
 * PDF §3 asks for at the ERPNext boundary, applied one level up.
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const t = translator(locale)
  const path = '/dashboard'

  const session = await currentSession()
  if (session === null) {
    return <SignInRequired locale={locale} t={t} active="dashboard" currentPath={path} authConfigured={authIsConfigured()} />
  }

  const { value: dashboard } = await getDashboard(getAppDeps(), session.customerId)
  const { summary, unavailable } = dashboard

  return (
    <AppShell
      locale={locale}
      t={t}
      active="dashboard"
      customerName={dashboard.customer.displayName}
      source={dashboard.source}
      currentPath={path}
    >
      <Page>
        <PageHead
          title={t('dashboard.welcome')}
          sub={<bdi>{dashboard.customer.displayName}</bdi>}
        />

        <TileRow>
          <Tile label={t('kpi.activeProjects')} value={summary.activeProjects} />
          <Tile label={t('kpi.itemsTotal')} value={summary.itemsTotal} />
          <Tile label={t('kpi.inManufacturing')} value={summary.itemsInManufacturing} />
          <Tile label={t('kpi.mfgComplete')} value={summary.itemsCompletedManufacturing} />
          <Tile
            label={t('kpi.awaitingYourApproval')}
            value={summary.awaitingYourApproval}
            hint={summary.awaitingYourApproval > 0 ? t('kpi.awaitingHint') : undefined}
            tone={summary.awaitingYourApproval > 0 ? 'attention' : 'default'}
          />
          {/*
           * The mockup's Paid / Outstanding / Overdue tiles cannot be filled from this
           * source. They are replaced by one tile that says so and by the panel below,
           * rather than by four zeros that would each be a false statement.
           */}
          <VoidTile label={t('kpi.itemsDelivered')} t={t} />
        </TileRow>

        {summary.projectsPastContractualDate > 0 && (
          <div style={{ marginBlockStart: 'var(--s3)' }}>
            <Card>
              <strong>{t('kpi.pastContractualDate')}:</strong> {summary.projectsPastContractualDate}{' '}
              {t('kpi.projectsSuffix', { n: summary.activeProjects })}
              <p style={{ marginBlockStart: 'var(--s2)', color: 'var(--ink-500)', fontSize: 'var(--text-sm)' }}>
                {t('schedule.explain')}
              </p>
            </Card>
          </div>
        )}

        <SectionHead title={t('dashboard.projectsHeading')} />

        {dashboard.projects.length === 0 ? (
          <EmptyState title={t('dashboard.noProjects')} body={t('dashboard.noProjectsBody')} />
        ) : (
          <ProjectGrid>
            {dashboard.projects.map((card) => (
              <ProjectCard key={card.id} card={card} locale={locale} t={t} />
            ))}
          </ProjectGrid>
        )}

        <SectionHead title={t('source.title')} />
        <div style={{ display: 'grid', gap: 'var(--s3)' }}>
          {unavailable.finance !== null && <Unavailable info={unavailable.finance} t={t} />}
          {unavailable.delivery !== null && <Unavailable info={unavailable.delivery} t={t} compact />}
          {unavailable.documents !== null && <Unavailable info={unavailable.documents} t={t} compact />}
          {unavailable.identity !== null && <Unavailable info={unavailable.identity} t={t} compact />}
        </div>
      </Page>
    </AppShell>
  )
}
