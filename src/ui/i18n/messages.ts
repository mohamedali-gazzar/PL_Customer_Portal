import type { Locale } from './locale'

/**
 * All customer-facing copy, in one place.
 *
 * Two reasons it lives here rather than in components:
 *
 *  - The unavailability messages are the portal's most sensitive copy. Telling a
 *    customer "we cannot show your invoices" has to be reviewable by sales and the
 *    PM team, and PDF §10 lists "neutral customer-facing wording for rework and
 *    delay statuses" as an open decision for exactly that reason. Copy embedded in
 *    a provider or a component is copy nobody reviews.
 *  - `ar` is typed against `en`, so a missing Arabic string is a compile error
 *    rather than an English word appearing mid-sentence in an Arabic page.
 */

const EN = {
  'app.name': 'POWERLINE',
  'app.portal': 'Customer Portal',
  'app.skipToContent': 'Skip to content',

  'nav.dashboard': 'Dashboard',
  'nav.projects': 'Projects',
  'nav.finance': 'Finance',
  'nav.documents': 'Documents',

  'locale.switch': 'العربية',
  'locale.switchLabel': 'Switch to Arabic',

  'source.title': 'Data source',
  'source.asOf': 'Data as of {date}',
  'source.snapshot': 'This is a snapshot, not a live connection.',
  'source.openBacklogOnly': 'Open orders only',
  'source.whatIsMissing': 'What this source does not include',
  'source.missingList':
    'Invoices, payments, currency and balances · delivery notes and delivery dates · FAT results and reports · document downloads. Order lines that have already been delivered are not in this extract, so delivery figures are not shown at all rather than shown as zero.',
  'source.provisionalIdentity':
    'Customer accounts in this preview are matched by company name, not by a permanent customer ID. This will be corrected before launch.',

  'dashboard.welcome': 'Welcome back',
  'dashboard.overview': 'Overview',
  'dashboard.projectsHeading': 'Your projects',
  'dashboard.noProjects': 'No open projects',
  'dashboard.noProjectsBody': 'There are no open orders for your account in the current data source.',

  'kpi.activeProjects': 'Open projects',
  'kpi.itemsTotal': 'Items on order',
  'kpi.inManufacturing': 'In manufacturing',
  'kpi.mfgComplete': 'Manufacturing complete',
  'kpi.awaitingYourApproval': 'Awaiting your approval',
  'kpi.pastContractualDate': 'Past contractual date',
  'kpi.itemsDelivered': 'Items delivered',
  'kpi.awaitingHint': 'drawings sent to you, not yet approved',
  'kpi.projectsSuffix': 'of {n} projects',

  'project.salesOrder': 'Sales order',
  'project.poNumber': 'Your PO number',
  'project.projectManager': 'Project manager',
  'project.orderedOn': 'Order date',
  'project.contractualDate': 'Contractual delivery',
  'project.contractualPeriod': 'Agreed lead time',
  'project.items': 'Items',
  'project.itemsBreakdown': '{manufactured} manufactured · {components} supplied',
  'project.viewProject': 'View project',
  'project.nextMilestone': 'Next milestone',
  'project.days.one': '1 day',
  'project.days.other': '{n} days',

  'progress.label': 'Progress',
  'progress.ofStages': '{percent}% of stages {stages}',
  'progress.basisNote':
    'Covers stages {stages} only. Later stages need data this source does not contain.',
  'progress.linesCounted': '{counted} of {total} items counted',
  'progress.linesExcluded.one': '1 item excluded: supplied components have no production journey.',
  'progress.linesExcluded.other':
    '{excluded} items excluded: supplied components have no production journey.',

  'schedule.on_track': 'On track',
  'schedule.due_soon': 'Due soon',
  'schedule.past_contractual_date': 'Past contractual date',
  'schedule.daysRemaining.one': '1 day remaining',
  'schedule.daysRemaining.other': '{n} days remaining',
  'schedule.daysOverdue.one': '1 day past',
  'schedule.daysOverdue.other': '{n} days past',
  'schedule.dueToday': 'Due today',
  'schedule.explain':
    'The contractual date has passed. This source cannot confirm whether the item has shipped, so no delivery status is shown.',

  'attention.awaitingYourApproval.one': '1 item awaiting your drawing approval',
  'attention.awaitingYourApproval.other': '{n} items awaiting your drawing approval',
  'attention.awaitingSince.one': 'sent to you yesterday',
  'attention.awaitingSince.other': 'sent to you {n} days ago',
  'attention.pastContractualDate': 'Contractual date has passed',
  'attention.onTrack': 'Nothing needs your attention',

  'stage.1': 'Drawings approval',
  'stage.2': 'Material readiness',
  'stage.3': 'Manufacturing',
  'stage.4': 'Factory acceptance test',
  'stage.5': 'Pre-delivery payment',
  'stage.6': 'Delivery',
  'stage.7': 'Financial clearance',
  'stage.short.1': 'Drawings',
  'stage.short.2': 'Material',
  'stage.short.3': 'Manufacturing',
  'stage.short.4': 'FAT',
  'stage.short.5': 'Payment',
  'stage.short.6': 'Delivery',
  'stage.short.7': 'Clearance',

  'status.under_preparation': 'Under preparation',
  'status.sent_for_approval': 'Sent for your approval',
  'status.approved': 'Approved',
  'status.material_not_available': 'Material not yet allocated',
  'status.partially_available': 'Partially available',
  'status.fully_available': 'Fully available',
  'status.not_started': 'Not started',
  'status.in_progress': 'In progress',
  'status.completed': 'Completed',
  'status.not_ready': 'Not ready',
  'status.fat_invitation': 'Ready for factory acceptance test',
  'status.fat_success': 'Test passed',
  'status.rework_in_progress': 'Final quality adjustments in progress',
  'status.rework_done': 'Quality adjustments complete',
  'status.delivery_payment_due': 'Payment due before delivery',
  'status.paid': 'Paid',
  'status.ready': 'Ready for delivery',
  'status.delivered': 'Delivered',
  'status.waiting_for_invoice': 'Awaiting invoice',
  'status.invoice_submitted': 'Invoice issued',
  'status.not_paid': 'Outstanding',

  'item.code': 'Item code',
  'item.quantity': 'Quantity',
  'item.produced': 'Produced',
  'item.remaining': 'Remaining',
  'item.cubicles': 'Cubicles',
  'item.currentStage': 'Current stage',
  'item.componentBadge': 'Supplied component',
  'item.noJourney': 'Supplied item — not manufactured, so no production stages apply.',
  'item.showDetail': 'Stage-by-stage detail',
  'item.hideDetail': 'Hide detail',
  'item.itemsHeading': 'Items',

  'view.stages': 'Stages',
  'view.timeline': 'Timeline',
  'view.label': 'View',

  'table.stage': 'Stage',
  'table.status': 'Status',
  'table.planned': 'Planned',
  'table.actual': 'Actual',
  'table.variance': 'Variance',
  'table.started': 'Started',
  'table.finished': 'Finished',
  'variance.late.one': '1 day late',
  'variance.late.other': '{n} days late',
  'variance.early.one': '1 day early',
  'variance.early.other': '{n} days early',
  'variance.onTime': 'On time',

  'basis.material_ready_proxy':
    'Start date derived from completion of material transfer, the measure Powerline uses for the manufacturing phase.',
  'basis.actual_start_date': 'Start date recorded on the work order.',

  'timeline.heading': 'Item timeline',
  'timeline.planned': 'Planned',
  'timeline.actual': 'Actual',
  'timeline.today': 'Today',
  'timeline.delay': 'Delay',
  'timeline.milestone': 'Milestone date',
  'timeline.span': 'Actual period',
  'timeline.legendPlanned': 'Planned milestone date',
  'timeline.legendActual': 'Actual period or date',
  'timeline.legendDelay': 'Time past the planned date',
  'timeline.noDates': 'No scheduled dates for this item in the current data source',
  'timeline.noDatesAtAll': 'No scheduled dates available',
  'timeline.noDatesAtAllBody':
    'None of the items on this order carry planned or actual dates in the current data source, so there is nothing to plot. The Stages view shows the status information that is available.',
  'timeline.plannedNote':
    'Planned dates appear as single markers rather than bars: this source records a planned finish for material and manufacturing, but no planned start for any stage.',

  'unknown.not_in_source': 'Not in this data source',
  'unknown.pending': 'Not yet',
  'unknown.not_applicable': 'Does not apply',
  'unknown.restricted': 'Not shown',
  'unknown.short': '—',

  'unavailable.stageTitle': 'Cannot be shown',
  'unavailable.outcomeNotRecorded': 'Outcome not recorded',
  'unavailable.rowExplained': 'Not available from this data source — see the note below.',
  'source.no_finance_data.title': 'Financial information is not available',
  'source.no_finance_data.body':
    'The current data source is a production extract. It contains no invoices, payments or currency information, so no financial figures can be shown. This means the information is missing — not that your balance is zero.',
  'source.no_document_data.title': 'Documents are not available',
  'source.no_document_data.body':
    'The current data source contains no attachments, so FAT reports, delivery notes and invoice PDFs cannot be offered yet.',
  'source.no_delivery_data.title': 'Delivery information is not available',
  'source.no_delivery_data.body':
    'The current data source contains no delivery records, and already-delivered order lines are excluded from it. Delivery status is therefore not shown at all, rather than shown as "not delivered".',
  'source.no_fat_outcome_data.title': 'Test results are not available',
  'source.no_fat_outcome_data.body':
    'This source shows when an item reaches the factory acceptance test, but records no test result. A stage marked "Ready for factory acceptance test" is not a statement that the test has or has not passed.',
  'source.no_planned_dates.title': 'Some planned dates are missing',
  'source.no_planned_dates.body':
    'This source records a planned finish date for material and manufacturing only. There is no planned start date for any stage, and no planned test or delivery date.',
  'source.open_backlog_only.title': 'Open orders only',
  'source.open_backlog_only.body':
    'This extract contains order lines that are still open. Completed and delivered lines are not included.',
  'source.provisional_identity.title': 'Preview account matching',
  'source.provisional_identity.body':
    'Accounts in this preview are matched by company name rather than a permanent customer ID.',

  'finance.heading': 'Finance',
  'documents.heading': 'Documents',

  'signin.heading': 'Sign in',
  'signin.body': 'Sign in to see your projects.',
  'signin.notConfigured': 'Sign-in is not configured yet',
  'signin.notConfiguredBody':
    'Customer accounts are created from contact records in ERPNext. That data is not in the current source, so authentication has not been enabled.',
  'signin.devHeading': 'Development sign-in',
  'signin.devBody':
    'This form exists only in development. Run npm run verify to list account identifiers.',
  'signin.accountId': 'Account identifier',
  'signin.submit': 'Continue',
  'signin.required': 'Sign in required',
  'signin.requiredBody': 'Your session has ended or has not started yet.',

  'notFound.heading': 'Project not found',
  'notFound.body': 'This project does not exist, or it is not on your account.',
  'notFound.back': 'Back to projects',

  'breadcrumb.projects': 'Projects',
  'a11y.stageRail': 'Production stages',
  'a11y.progressOf': '{percent} percent',
} as const

export type MessageKey = keyof typeof EN
type Dictionary = Record<MessageKey, string>

const AR: Dictionary = {
  'app.name': 'POWERLINE',
  'app.portal': 'بوابة العملاء',
  'app.skipToContent': 'الانتقال إلى المحتوى',

  'nav.dashboard': 'الرئيسية',
  'nav.projects': 'المشروعات',
  'nav.finance': 'الحسابات',
  'nav.documents': 'المستندات',

  'locale.switch': 'English',
  'locale.switchLabel': 'التحويل إلى الإنجليزية',

  'source.title': 'مصدر البيانات',
  'source.asOf': 'البيانات حتى {date}',
  'source.snapshot': 'هذه نسخة ثابتة من البيانات وليست اتصالاً مباشراً.',
  'source.openBacklogOnly': 'الأوامر المفتوحة فقط',
  'source.whatIsMissing': 'ما لا يشمله هذا المصدر',
  'source.missingList':
    'الفواتير والمدفوعات والعملة والأرصدة · إشعارات التسليم وتواريخه · نتائج اختبار المصنع وتقاريره · تنزيل المستندات. كما أن بنود الأوامر التي تم تسليمها بالفعل غير موجودة في هذا الملف، ولذلك لا تُعرض بيانات التسليم إطلاقاً بدلاً من عرضها كصفر.',
  'source.provisionalIdentity':
    'يتم مطابقة حسابات العملاء في هذه النسخة التجريبية بالاسم التجاري وليس بمعرّف دائم للعميل. سيتم تصحيح ذلك قبل الإطلاق.',

  'dashboard.welcome': 'مرحباً بك',
  'dashboard.overview': 'نظرة عامة',
  'dashboard.projectsHeading': 'مشروعاتك',
  'dashboard.noProjects': 'لا توجد مشروعات مفتوحة',
  'dashboard.noProjectsBody': 'لا توجد أوامر مفتوحة لحسابك في مصدر البيانات الحالي.',

  'kpi.activeProjects': 'المشروعات المفتوحة',
  'kpi.itemsTotal': 'البنود المطلوبة',
  'kpi.inManufacturing': 'قيد التصنيع',
  'kpi.mfgComplete': 'اكتمل تصنيعها',
  'kpi.awaitingYourApproval': 'في انتظار موافقتك',
  'kpi.pastContractualDate': 'تجاوزت التاريخ التعاقدي',
  'kpi.itemsDelivered': 'البنود المسلَّمة',
  'kpi.awaitingHint': 'رسومات أُرسلت إليك ولم تُعتمد بعد',
  'kpi.projectsSuffix': 'من {n} مشروعات',

  'project.salesOrder': 'أمر البيع',
  'project.poNumber': 'رقم أمر الشراء الخاص بك',
  'project.projectManager': 'مدير المشروع',
  'project.orderedOn': 'تاريخ الأمر',
  'project.contractualDate': 'التسليم التعاقدي',
  'project.contractualPeriod': 'مدة التنفيذ المتفق عليها',
  'project.items': 'البنود',
  'project.itemsBreakdown': '{manufactured} مُصنَّعة · {components} مورَّدة',
  'project.viewProject': 'عرض المشروع',
  'project.nextMilestone': 'المرحلة التالية',
  'project.days.one': 'يوم واحد',
  'project.days.other': '{n} يوماً',

  'progress.label': 'التقدّم',
  'progress.ofStages': '{percent}% من المراحل {stages}',
  'progress.basisNote':
    'يشمل المراحل {stages} فقط. المراحل التالية تحتاج بيانات غير متوفرة في هذا المصدر.',
  'progress.linesCounted': 'تم حساب {counted} من {total} بنداً',
  'progress.linesExcluded.one': 'تم استثناء بند واحد: البنود المورَّدة ليس لها مسار تصنيع.',
  'progress.linesExcluded.other':
    'تم استثناء {excluded} بنداً: البنود المورَّدة ليس لها مسار تصنيع.',

  'schedule.on_track': 'في الموعد',
  'schedule.due_soon': 'يقترب الاستحقاق',
  'schedule.past_contractual_date': 'تجاوز التاريخ التعاقدي',
  'schedule.daysRemaining.one': 'يتبقى يوم واحد',
  'schedule.daysRemaining.other': 'يتبقى {n} يوماً',
  'schedule.daysOverdue.one': 'مرّ يوم واحد',
  'schedule.daysOverdue.other': 'مرّ {n} يوماً',
  'schedule.dueToday': 'الاستحقاق اليوم',
  'schedule.explain':
    'انقضى التاريخ التعاقدي. لا يمكن لهذا المصدر تأكيد ما إذا كان البند قد شُحن، ولذلك لا تُعرض حالة التسليم.',

  'attention.awaitingYourApproval.one': 'بند واحد في انتظار اعتمادك للرسومات',
  'attention.awaitingYourApproval.other': '{n} بنداً في انتظار اعتمادك للرسومات',
  'attention.awaitingSince.one': 'أُرسلت إليك أمس',
  'attention.awaitingSince.other': 'أُرسلت إليك منذ {n} يوماً',
  'attention.pastContractualDate': 'انقضى التاريخ التعاقدي',
  'attention.onTrack': 'لا يوجد ما يتطلب انتباهك',

  'stage.1': 'اعتماد الرسومات',
  'stage.2': 'جاهزية المواد',
  'stage.3': 'التصنيع',
  'stage.4': 'اختبار القبول بالمصنع',
  'stage.5': 'الدفعة قبل التسليم',
  'stage.6': 'التسليم',
  'stage.7': 'الإبراء المالي',
  'stage.short.1': 'الرسومات',
  'stage.short.2': 'المواد',
  'stage.short.3': 'التصنيع',
  'stage.short.4': 'الاختبار',
  'stage.short.5': 'الدفع',
  'stage.short.6': 'التسليم',
  'stage.short.7': 'الإبراء',

  'status.under_preparation': 'قيد الإعداد',
  'status.sent_for_approval': 'أُرسلت لاعتمادك',
  'status.approved': 'معتمدة',
  'status.material_not_available': 'لم تُخصَّص المواد بعد',
  'status.partially_available': 'متوفرة جزئياً',
  'status.fully_available': 'متوفرة بالكامل',
  'status.not_started': 'لم يبدأ',
  'status.in_progress': 'جارٍ التنفيذ',
  'status.completed': 'مكتمل',
  'status.not_ready': 'غير جاهز',
  'status.fat_invitation': 'جاهز لاختبار القبول بالمصنع',
  'status.fat_success': 'نجح الاختبار',
  'status.rework_in_progress': 'جارٍ إجراء تعديلات الجودة النهائية',
  'status.rework_done': 'اكتملت تعديلات الجودة',
  'status.delivery_payment_due': 'دفعة مستحقة قبل التسليم',
  'status.paid': 'مدفوعة',
  'status.ready': 'جاهز للتسليم',
  'status.delivered': 'تم التسليم',
  'status.waiting_for_invoice': 'في انتظار الفاتورة',
  'status.invoice_submitted': 'صدرت الفاتورة',
  'status.not_paid': 'غير مسددة',

  'item.code': 'كود البند',
  'item.quantity': 'الكمية',
  'item.produced': 'المُنتَج',
  'item.remaining': 'المتبقي',
  'item.cubicles': 'عدد الخلايا',
  'item.currentStage': 'المرحلة الحالية',
  'item.componentBadge': 'بند مورَّد',
  'item.noJourney': 'بند مورَّد وليس مُصنَّعاً، ولذلك لا تنطبق عليه مراحل التصنيع.',
  'item.showDetail': 'التفاصيل مرحلة بمرحلة',
  'item.hideDetail': 'إخفاء التفاصيل',
  'item.itemsHeading': 'البنود',

  'view.stages': 'المراحل',
  'view.timeline': 'الجدول الزمني',
  'view.label': 'العرض',

  'table.stage': 'المرحلة',
  'table.status': 'الحالة',
  'table.planned': 'المخطط',
  'table.actual': 'الفعلي',
  'table.variance': 'الفرق',
  'table.started': 'البداية',
  'table.finished': 'النهاية',
  'variance.late.one': 'تأخير يوم واحد',
  'variance.late.other': 'تأخير {n} يوماً',
  'variance.early.one': 'تقدّم يوم واحد',
  'variance.early.other': 'تقدّم {n} يوماً',
  'variance.onTime': 'في الموعد',

  'basis.material_ready_proxy':
    'تاريخ البداية مستنتج من اكتمال تحويل المواد، وهو المقياس الذي تستخدمه باورلاين لمرحلة التصنيع.',
  'basis.actual_start_date': 'تاريخ البداية المسجَّل على أمر التشغيل.',

  'timeline.heading': 'الجدول الزمني للبنود',
  'timeline.planned': 'المخطط',
  'timeline.actual': 'الفعلي',
  'timeline.today': 'اليوم',
  'timeline.delay': 'تأخير',
  'timeline.milestone': 'تاريخ المرحلة',
  'timeline.span': 'الفترة الفعلية',
  'timeline.legendPlanned': 'تاريخ المرحلة المخطط',
  'timeline.legendActual': 'الفترة أو التاريخ الفعلي',
  'timeline.legendDelay': 'المدة بعد التاريخ المخطط',
  'timeline.noDates': 'لا توجد تواريخ مجدولة لهذا البند في مصدر البيانات الحالي',
  'timeline.noDatesAtAll': 'لا توجد تواريخ مجدولة',
  'timeline.noDatesAtAllBody':
    'لا يحمل أي بند في هذا الأمر تواريخ مخططة أو فعلية في مصدر البيانات الحالي، ولذلك لا يوجد ما يمكن رسمه. يعرض تبويب المراحل المعلومات المتوفرة عن الحالة.',
  'timeline.plannedNote':
    'تظهر التواريخ المخططة كعلامات مفردة لا كأشرطة: يسجّل هذا المصدر تاريخ انتهاء مخططاً للمواد والتصنيع، دون أي تاريخ بداية مخطط لأي مرحلة.',

  'unknown.not_in_source': 'غير متوفر في هذا المصدر',
  'unknown.pending': 'لم يحدث بعد',
  'unknown.not_applicable': 'لا ينطبق',
  'unknown.restricted': 'غير معروض',
  'unknown.short': '—',

  'unavailable.stageTitle': 'لا يمكن عرضها',
  'unavailable.outcomeNotRecorded': 'النتيجة غير مسجَّلة',
  'unavailable.rowExplained': 'غير متوفر من مصدر البيانات الحالي — انظر الملاحظة أدناه.',
  'source.no_finance_data.title': 'المعلومات المالية غير متوفرة',
  'source.no_finance_data.body':
    'مصدر البيانات الحالي هو ملف بيانات إنتاج، ولا يحتوي على فواتير أو مدفوعات أو بيانات عملة، ولذلك لا يمكن عرض أي أرقام مالية. هذا يعني أن المعلومات غير متوفرة، وليس أن رصيدك صفر.',
  'source.no_document_data.title': 'المستندات غير متوفرة',
  'source.no_document_data.body':
    'لا يحتوي مصدر البيانات الحالي على مرفقات، ولذلك لا يمكن إتاحة تقارير اختبار المصنع وإشعارات التسليم وملفات الفواتير بعد.',
  'source.no_delivery_data.title': 'بيانات التسليم غير متوفرة',
  'source.no_delivery_data.body':
    'لا يحتوي مصدر البيانات الحالي على سجلات تسليم، كما أن بنود الأوامر المسلَّمة مستثناة منه. ولذلك لا تُعرض حالة التسليم إطلاقاً بدلاً من عرضها كـ«لم يتم التسليم».',
  'source.no_fat_outcome_data.title': 'نتائج الاختبار غير متوفرة',
  'source.no_fat_outcome_data.body':
    'يوضح هذا المصدر متى يصل البند إلى اختبار القبول بالمصنع، لكنه لا يسجّل نتيجة الاختبار. والمرحلة الموسومة «جاهز لاختبار القبول بالمصنع» ليست إقراراً بنجاح الاختبار أو فشله.',
  'source.no_planned_dates.title': 'بعض التواريخ المخططة غير متوفرة',
  'source.no_planned_dates.body':
    'يسجّل هذا المصدر تاريخ انتهاء مخططاً للمواد والتصنيع فقط. ولا يوجد تاريخ بداية مخطط لأي مرحلة، ولا تاريخ مخطط للاختبار أو التسليم.',
  'source.open_backlog_only.title': 'الأوامر المفتوحة فقط',
  'source.open_backlog_only.body':
    'يحتوي هذا الملف على بنود الأوامر التي لا تزال مفتوحة. البنود المكتملة والمسلَّمة غير مشمولة.',
  'source.provisional_identity.title': 'مطابقة الحساب في النسخة التجريبية',
  'source.provisional_identity.body':
    'تُطابق الحسابات في هذه النسخة بالاسم التجاري بدلاً من معرّف دائم للعميل.',

  'finance.heading': 'الحسابات',
  'documents.heading': 'المستندات',

  'signin.heading': 'تسجيل الدخول',
  'signin.body': 'سجّل الدخول لعرض مشروعاتك.',
  'signin.notConfigured': 'لم يتم تهيئة تسجيل الدخول بعد',
  'signin.notConfiguredBody':
    'تُنشأ حسابات العملاء من سجلات جهات الاتصال في ERPNext. هذه البيانات غير متوفرة في المصدر الحالي، ولذلك لم يتم تمكين المصادقة.',
  'signin.devHeading': 'تسجيل دخول للتطوير',
  'signin.devBody':
    'هذا النموذج موجود في بيئة التطوير فقط. نفّذ npm run verify لعرض معرّفات الحسابات.',
  'signin.accountId': 'معرّف الحساب',
  'signin.submit': 'متابعة',
  'signin.required': 'مطلوب تسجيل الدخول',
  'signin.requiredBody': 'انتهت جلستك أو لم تبدأ بعد.',

  'notFound.heading': 'المشروع غير موجود',
  'notFound.body': 'هذا المشروع غير موجود، أو أنه ليس على حسابك.',
  'notFound.back': 'الرجوع إلى المشروعات',

  'breadcrumb.projects': 'المشروعات',
  'a11y.stageRail': 'مراحل الإنتاج',
  'a11y.progressOf': '{percent} بالمئة',
}

const MESSAGES: Record<Locale, Dictionary> = { en: EN, ar: AR }

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

/**
 * Count-aware lookup.
 *
 * English has two forms and Arabic more, but every plural in this UI is a simple
 * count, so a one/other split covers both correctly — and "1 days late" on a premium
 * portal reads as a bug. `base` names a key pair (`variance.late.one` /
 * `variance.late.other`); the compiler checks both exist.
 */
export type TranslatePlural = (
  base: PluralKey,
  n: number,
  values?: Record<string, string | number>,
) => string

/** Bases that have `.one` and `.other` variants. */
export type PluralKey =
  | 'project.days'
  | 'schedule.daysRemaining'
  | 'schedule.daysOverdue'
  | 'attention.awaitingYourApproval'
  | 'attention.awaitingSince'
  | 'variance.late'
  | 'variance.early'
  | 'progress.linesExcluded'

export function pluralizer(locale: Locale): TranslatePlural {
  const t = translator(locale)
  return (base, n, values) =>
    t(`${base}.${Math.abs(n) === 1 ? 'one' : 'other'}` as MessageKey, { n, ...values })
}

export function translator(locale: Locale): Translate {
  const dictionary = MESSAGES[locale]
  return (key, values) => {
    const template = dictionary[key]
    if (values === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : match,
    )
  }
}
