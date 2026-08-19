'use client'

/**
 * Interface language.
 *
 * Scope is deliberate: the customer-facing screens are bilingual, and the staff
 * PM console stays English. Its audience is Powerline's own project managers, and
 * translating internal cycle-time vocabulary would add terminology to maintain
 * for no reader.
 *
 * The Arabic below is a first pass and is marked as such in the README. Terms like
 * "open backlog", "work order" and "contractual date" have settled equivalents
 * inside Powerline that a translator outside the company should not invent —
 * anything the business words differently should be corrected here, in one file,
 * without touching a component.
 *
 * Numerals stay Latin in both languages. Every figure on these screens sits beside
 * an identifier a customer may quote back — a sales order number, a day count in an
 * email — and mixing numeral systems there costs more than idiomatic Arabic-Indic
 * digits would gain.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { usePrefs, type Locale } from './prefs'

/** Every string the bilingual screens use. Keys are English, for greppability. */
const MESSAGES = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.projects': 'Projects',
    'nav.finance': 'Finance',
    'nav.documents': 'Documents',
    'nav.console': 'PM Console',
    'nav.soon': 'Soon',

    'shell.customerPortal': 'Customer Portal',
    'shell.pmConsole': 'Project Management Console',
    'shell.signOut': 'Sign out',
    'shell.backToConsole': '← PM console',
    'shell.appearance': 'Appearance',
    'shell.language': 'Language',
    'shell.themeSystem': 'System',
    'shell.themeLight': 'Light',
    'shell.themeDark': 'Dark',

    'dash.welcome': 'Welcome back',
    'dash.asAt': 'data as at {date}',
    'dash.allWithin': 'All orders within contractual date',
    'dash.pastDue': '{n} order(s) past contractual date',
    'dash.yourProjects': 'Your projects',

    'kpi.contract': 'Total contract value',
    'kpi.backlog': 'Total open backlog',
    'kpi.allProjects': 'All projects',
    'kpi.orderedIn': 'Ordered in {year}',
    'kpi.exact': 'Exact',
    'kpi.scope': 'Scope',
    'kpi.panelsOrdered': 'Panels ordered',
    'kpi.panelsRemaining': 'Panels remaining',

    'filter.orderYear': 'Order year',
    'filter.allProjects': 'All projects',
    'filter.workOrder': 'Work order',
    'filter.anyStatus': 'Any status',
    'filter.projects': '{n} projects',
    'filter.ofProjects': '{shown} of {total} projects',
    'filter.noMatch': 'No projects match these filters.',
    'filter.clear': 'Clear filters',

    'wo.completed': 'Completed',
    'wo.inprocess': 'In process',
    'wo.notstarted': 'Not started',
    'wo.nowo': 'No work order yet',

    'status.hold': 'On hold',
    'status.late': 'Past contractual date',
    'status.action': 'Action needed',
    'status.ontrack': 'On track',

    'list.project': 'Project',
    'list.status': 'Status',
    'list.progress': 'Progress',
    'list.contract': 'Contract',
    'list.openBacklog': 'Open backlog',
    'list.lines': '{n} lines',
    'list.panels': '{delivered} / {total} panels',
    'list.overdue': '{n} days overdue',
    'list.due': 'due {date}',
    'list.noDate': 'no contractual date',

    'proj.title': 'Projects',
    'proj.salesOrders': '{n} sales orders',
    'proj.ordered': 'ordered {date}',
    'proj.contract': 'contract {value}',
    'proj.contractualDelivery': 'contractual delivery {date}',
    'proj.notSet': 'not set',
    'proj.dayPeriod': '({n}-day period)',
    'proj.pm': 'PM: {name}',
    'proj.complete': '{n}% complete',
    'proj.within': 'Within contractual date',
    'proj.itemDetail': 'Item detail',
    'proj.timeline': 'Item milestone timeline',

    'table.item': 'Item',
    'table.description': 'Description',
    'table.qty': 'Qty',
    'table.delivered': 'Delivered',
    'table.workOrder': 'Work order',
    'table.currentStage': 'Current stage',
    'table.material': 'Material',
    'table.progress': 'Progress',
    'table.contractValue': 'Contract value',
    'table.noWorkOrder': 'No work order',
    'table.hold': 'Hold',
  },

  ar: {
    'nav.dashboard': 'لوحة المتابعة',
    'nav.projects': 'المشروعات',
    'nav.finance': 'الحسابات',
    'nav.documents': 'المستندات',
    'nav.console': 'وحدة إدارة المشروعات',
    'nav.soon': 'قريبًا',

    'shell.customerPortal': 'بوابة العملاء',
    'shell.pmConsole': 'وحدة إدارة المشروعات',
    'shell.signOut': 'تسجيل الخروج',
    'shell.backToConsole': '→ وحدة الإدارة',
    'shell.appearance': 'المظهر',
    'shell.language': 'اللغة',
    'shell.themeSystem': 'النظام',
    'shell.themeLight': 'فاتح',
    'shell.themeDark': 'داكن',

    'dash.welcome': 'مرحبًا بعودتك',
    'dash.asAt': 'البيانات حتى {date}',
    'dash.allWithin': 'جميع الأوامر داخل التاريخ التعاقدي',
    'dash.pastDue': '{n} أمر تجاوز التاريخ التعاقدي',
    'dash.yourProjects': 'مشروعاتك',

    'kpi.contract': 'إجمالي قيمة التعاقد',
    'kpi.backlog': 'إجمالي الرصيد المفتوح',
    'kpi.allProjects': 'جميع المشروعات',
    'kpi.orderedIn': 'الأوامر في {year}',
    'kpi.exact': 'القيمة بالتفصيل',
    'kpi.scope': 'النطاق',
    'kpi.panelsOrdered': 'اللوحات المطلوبة',
    'kpi.panelsRemaining': 'اللوحات المتبقية',

    'filter.orderYear': 'سنة الأمر',
    'filter.allProjects': 'جميع المشروعات',
    'filter.workOrder': 'أمر التشغيل',
    'filter.anyStatus': 'كل الحالات',
    'filter.projects': '{n} مشروع',
    'filter.ofProjects': '{shown} من {total} مشروع',
    'filter.noMatch': 'لا توجد مشروعات مطابقة لهذه الفلاتر.',
    'filter.clear': 'إزالة الفلاتر',

    'wo.completed': 'مكتمل',
    'wo.inprocess': 'جارٍ التنفيذ',
    'wo.notstarted': 'لم يبدأ',
    'wo.nowo': 'لا يوجد أمر تشغيل',

    'status.hold': 'موقوف',
    'status.late': 'تجاوز التاريخ التعاقدي',
    'status.action': 'يتطلب إجراءً منك',
    'status.ontrack': 'يسير كما هو مخطط',

    'list.project': 'المشروع',
    'list.status': 'الحالة',
    'list.progress': 'التقدم',
    'list.contract': 'التعاقد',
    'list.openBacklog': 'الرصيد المفتوح',
    'list.lines': '{n} بند',
    'list.panels': '{delivered} / {total} لوحة',
    'list.overdue': 'متأخر {n} يوم',
    'list.due': 'الاستحقاق {date}',
    'list.noDate': 'لا يوجد تاريخ تعاقدي',

    'proj.title': 'المشروعات',
    'proj.salesOrders': '{n} أمر بيع',
    'proj.ordered': 'تاريخ الأمر {date}',
    'proj.contract': 'التعاقد {value}',
    'proj.contractualDelivery': 'التسليم التعاقدي {date}',
    'proj.notSet': 'غير محدد',
    'proj.dayPeriod': '(مدة {n} يوم)',
    'proj.pm': 'مدير المشروع: {name}',
    'proj.complete': 'مكتمل {n}%',
    'proj.within': 'داخل التاريخ التعاقدي',
    'proj.itemDetail': 'تفاصيل البنود',
    'proj.timeline': 'الجدول الزمني لمراحل البنود',

    'table.item': 'البند',
    'table.description': 'الوصف',
    'table.qty': 'الكمية',
    'table.delivered': 'المسلَّم',
    'table.workOrder': 'أمر التشغيل',
    'table.currentStage': 'المرحلة الحالية',
    'table.material': 'المواد',
    'table.progress': 'التقدم',
    'table.contractValue': 'قيمة التعاقد',
    'table.noWorkOrder': 'لا يوجد أمر تشغيل',
    'table.hold': 'موقوف',
  },
} as const

export type MessageKey = keyof (typeof MESSAGES)['en']
type Vars = Record<string, string | number>

export type Translate = (key: MessageKey, vars?: Vars) => string

const TContext = createContext<Translate | null>(null)

export function useT(): Translate {
  const t = useContext(TContext)
  if (!t) throw new Error('useT must be used inside <I18nProvider>')
  return t
}

/** Also exposed for a11y strings that need the current locale directly. */
export function useLocale(): Locale {
  return usePrefs().locale
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = usePrefs()

  const t = useCallback<Translate>(
    (key, vars) => {
      const table = MESSAGES[locale] as Record<string, string>
      // Falling back to English is the honest failure: a missing Arabic string
      // shows the English one rather than a raw key.
      const raw = table[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        vars[name] === undefined ? `{${name}}` : String(vars[name]),
      )
    },
    [locale],
  )

  const value = useMemo(() => t, [t])
  return <TContext.Provider value={value}>{children}</TContext.Provider>
}
