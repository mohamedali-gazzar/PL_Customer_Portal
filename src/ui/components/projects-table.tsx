import type { ProjectListItemDto } from '@/dto/projects'
import { formatDate, type Locale } from '@/ui/i18n/locale'
import { pluralizer, type Translate } from '@/ui/i18n/messages'
import { Badge, Progress, Value } from './primitives'
import { ScheduleBadge } from './project-card'
import s from './projects-table.module.css'

/**
 * The projects list.
 *
 * A table rather than the dashboard's cards: this is the "find the one I want" view,
 * and a customer with 11 open orders — the second-largest account in the export —
 * needs to compare rows, not read eleven cards. It collapses to self-labelling cards
 * below 760px.
 */
export function ProjectsTable({
  projects,
  locale,
  t,
}: {
  projects: readonly ProjectListItemDto[]
  locale: Locale
  t: Translate
}) {
  const tp = pluralizer(locale)
  return (
    <div className={s.wrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t('project.items')}</th>
            <th scope="col">{t('progress.label')}</th>
            <th scope="col">{t('project.contractualDate')}</th>
            <th scope="col">{t('project.projectManager')}</th>
            <th scope="col">{t('project.poNumber')}</th>
            <th scope="col">{t('kpi.awaitingYourApproval')}</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <th scope="row" className={s.nameCell}>
                <a className={s.nameLink} href={`/${locale}/projects/${encodeURIComponent(project.id)}`}>
                  <div className={s.name}>
                    <bdi>{project.displayName}</bdi>
                  </div>
                  <div className={`${s.sub} ltr-num`}>
                    {project.salesOrderNo} · {project.itemCount} {t('project.items')}
                  </div>
                </a>
              </th>
              <td className={s.progressCell} data-label={t('progress.label')}>
                <Progress progress={project.progress} t={t} tp={tp} />
              </td>
              <td className={s.nowrap} data-label={t('project.contractualDate')}>
                <div>
                  <Value
                    value={project.contractualDate}
                    t={t}
                    render={(v) => <span className="ltr-num">{formatDate(locale, String(v))}</span>}
                  />
                </div>
                <div className={s.sub}>
                  <ScheduleBadge schedule={project.schedule} locale={locale} t={t} />
                </div>
              </td>
              <td data-label={t('project.projectManager')}>
                <Value value={project.projectManager} t={t} />
              </td>
              <td data-label={t('project.poNumber')}>
                <Value value={project.customerPoNo} t={t} />
              </td>
              <td data-label={t('kpi.awaitingYourApproval')}>
                {project.awaitingCustomer > 0 ? (
                  <Badge tone="accent" dot>
                    <span className={s.num}>{project.awaitingCustomer}</span>
                  </Badge>
                ) : (
                  <Badge tone="neutral">—</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
