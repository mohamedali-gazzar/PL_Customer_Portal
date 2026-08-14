import { parseProjectIdParam } from '@/domain'
import { getProjectDetail } from '@/application/project-detail'
import { getAppDeps } from '@/infra/container'
import { authIsConfigured, currentSession } from '@/infra/session/current'
import { formatDate, parseLocale } from '@/ui/i18n/locale'
import { pluralizer, translator } from '@/ui/i18n/messages'
import { AppShell } from '@/ui/components/shell'
import {
  Badge,
  Breadcrumbs,
  Card,
  DefGrid,
  EmptyState,
  Field,
  LinkButton,
  Page,
  PageHead,
  Progress,
  SectionHead,
  Unavailable,
  ViewToggle,
} from '@/ui/components/primitives'
import { ScheduleBadge } from '@/ui/components/project-card'
import { StageRailLegend } from '@/ui/components/stage-rail'
import { ItemStageList } from '@/ui/components/item-stages'
import { hasPlottableDates, ItemTimeline } from '@/ui/components/timeline'
import { SignInRequired } from '@/ui/pages/gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type View = 'stages' | 'timeline'

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; projectId: string }>
  searchParams: Promise<{ view?: string; item?: string }>
}) {
  const { locale: rawLocale, projectId: rawProjectId } = await params
  const locale = parseLocale(rawLocale)
  const t = translator(locale)
  const tp = pluralizer(locale)
  const search = await searchParams
  const view: View = search.view === 'timeline' ? 'timeline' : 'stages'
  // Which item's stage detail is expanded. Server-rendered state, so the page weight
  // does not grow with item count and the expansion is shareable.
  const expandedItemId = typeof search.item === 'string' && search.item !== '' ? search.item : null
  const path = `/projects/${rawProjectId}${view === 'timeline' ? '?view=timeline' : ''}`

  const session = await currentSession()
  if (session === null) {
    return <SignInRequired locale={locale} t={t} active="projects" currentPath={path} authConfigured={authIsConfigured()} />
  }

  // Shape validation only. Ownership is the provider's job, and a well-formed id
  // belonging to another customer resolves to null exactly like a missing one.
  const projectId = parseProjectIdParam(rawProjectId)
  const detail =
    projectId === null ? null : (await getProjectDetail(getAppDeps(), session.customerId, projectId)).value

  if (detail === null) {
    return (
      <AppShell locale={locale} t={t} active="projects" customerName={null} source={null} currentPath={path}>
        <Page>
          <EmptyState title={t('notFound.heading')} body={t('notFound.body')} />
          <p style={{ marginBlockStart: 'var(--s4)', textAlign: 'center' }}>
            <LinkButton href={`/${locale}/projects`} ghost>
              {t('notFound.back')}
            </LinkButton>
          </p>
        </Page>
      </AppShell>
    )
  }

  const { project, items, unavailable, source } = detail
  const base = `/${locale}/projects/${encodeURIComponent(project.id)}`
  const today = source.asOf.known ? source.asOf.value : new Date().toISOString().slice(0, 10)

  return (
    <AppShell
      locale={locale}
      t={t}
      active="projects"
      customerName={detail.customer.displayName === '' ? null : detail.customer.displayName}
      source={source}
      currentPath={path}
    >
      <Page>
        <Breadcrumbs
          items={[
            { label: t('breadcrumb.projects'), href: `/${locale}/projects` },
            { label: project.salesOrderNo },
          ]}
        />

        <PageHead
          title={<bdi>{project.displayName}</bdi>}
          sub={
            <>
              <span className="ltr-num">{project.salesOrderNo}</span>
              {project.projectCode.known && (
                <>
                  {' · '}
                  <span className="ltr-num">{project.projectCode.value}</span>
                </>
              )}
            </>
          }
          aside={
            <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
              <ScheduleBadge schedule={project.schedule} locale={locale} t={t} />
              {project.attention.awaitingCustomer > 0 && (
                <Badge tone="accent" dot>
                  {tp('attention.awaitingYourApproval', project.attention.awaitingCustomer)}
                </Badge>
              )}
            </div>
          }
        />

        <Card>
          <DefGrid>
            <Field label={t('project.poNumber')} value={project.customerPoNo} t={t} />
            <Field label={t('project.projectManager')} value={project.projectManager} t={t} />
            <Field
              label={t('project.orderedOn')}
              value={project.orderedOn}
              t={t}
              render={(v) => <span className="ltr-num">{formatDate(locale, String(v))}</span>}
            />
            <Field
              label={t('project.contractualDate')}
              value={project.contractualDate}
              t={t}
              render={(v) => <span className="ltr-num">{formatDate(locale, String(v))}</span>}
            />
            <Field
              label={t('project.contractualPeriod')}
              value={project.contractualPeriodDays}
              t={t}
              render={(v) => tp('project.days', Number(v))}
            />
            <Field
              label={t('project.items')}
              value={{ known: true, value: project.itemCounts.total }}
              t={t}
              render={(v) => (
                <>
                  <span className="ltr-num">{v}</span>
                  <span style={{ display: 'block', color: 'var(--ink-400)', fontSize: 'var(--text-xs)', fontWeight: 400 }}>
                    {t('project.itemsBreakdown', {
                      manufactured: project.itemCounts.manufactured,
                      components: project.itemCounts.suppliedComponents,
                    })}
                  </span>
                </>
              )}
            />
          </DefGrid>

          <div style={{ marginBlockStart: 'var(--s5)', maxWidth: '520px' }}>
            <Progress progress={project.progress} t={t} tp={tp} showNote />
          </div>
        </Card>

        <SectionHead
          title={t('item.itemsHeading')}
          aside={
            <ViewToggle
              label={t('view.label')}
              items={[
                { label: t('view.stages'), href: base, active: view === 'stages' },
                { label: t('view.timeline'), href: `${base}?view=timeline`, active: view === 'timeline' },
              ]}
            />
          }
        />

        {view === 'stages' ? (
          <>
            <ItemStageList
              items={items}
              locale={locale}
              t={t}
              baseHref={base}
              expandedItemId={expandedItemId}
            />
            <StageRailLegend t={t} />
          </>
        ) : hasPlottableDates(items) ? (
          <ItemTimeline items={items} today={today} locale={locale} t={t} />
        ) : (
          <EmptyState title={t('timeline.noDatesAtAll')} body={t('timeline.noDatesAtAllBody')} />
        )}

        <SectionHead title={t('source.title')} />
        <div style={{ display: 'grid', gap: 'var(--s3)' }}>
          {unavailable.fat !== null && <Unavailable info={unavailable.fat} t={t} compact />}
          {unavailable.plannedDates !== null && <Unavailable info={unavailable.plannedDates} t={t} compact />}
          {unavailable.delivery !== null && <Unavailable info={unavailable.delivery} t={t} compact />}
          {unavailable.finance !== null && <Unavailable info={unavailable.finance} t={t} compact />}
          {unavailable.documents !== null && <Unavailable info={unavailable.documents} t={t} compact />}
        </div>
      </Page>
    </AppShell>
  )
}
