# Zephyx Product Differentiation v2

## الهدف

Zephyx ليس نسخة من Gmail أو Outlook؛ بل مساحة إنتاجية تجمع البريد والمهام والتقويم والمتابعات في سياق واحد، مع تحكم واضح بالبيانات وعزل الحسابات. هذه الوثيقة تصف ما نُفّذ فعليًا في PR #8، وما يبقى مرتبطًا بخدمات خارجية أو بإعدادات غير مفعّلة.

## Unified Productivity Workspace

تعرض صفحة Workspace البيانات الحقيقية من PostgreSQL في ستة مسارات عملية: الرسائل المهمة، المهام المتأخرة، الاجتماعات القادمة، المسودات، الرسائل التي تحتاج ردًا، ومركز المتابعات. كما تعرض Smart Inbox بإشارات قابلة للتفسير مثل unread وstarred وprimary وwork وdeadline وmeeting، ولا تدّعي تصنيفًا صامتًا من AI.

كل عنصر مصدر قابل للفتح أو الإجراء من خلال API محمي بالجلسة وملكية المستخدم. البحث المحفوظ وإجراءات Create task وFollow up وفتح المحادثة تعتمد على البيانات الفعلية، وتظهر حالات loading وerror وempty، وتحتفظ واجهة الهاتف بآخر snapshot محلي عند انقطاع الشبكة بدل عرض أرقام اصطناعية.

| المسار | API/التنفيذ | إثبات الاختبار |
|---|---|---|
| Workspace snapshot وSmart Inbox | `GET /api/productivity/workspace` و`GET /api/productivity/smart-inbox` | اختبارات HTTP/PostgreSQL في `artifacts/api-server/src/__tests__/api.test.ts` واختبارات authenticated في `tests/e2e/productivity-deep.spec.ts` |
| المهام والمواعيد والمتابعات | `POST/PATCH /api/productivity/tasks`, `POST /api/productivity/calendar/events`, `POST/PATCH /api/productivity/follow-ups` | اختبارات الملكية والعزل ودورات Workspace في API وPlaywright |
| Saved searches وQuick actions | محفوظة في `workspace_preferences` وتعرضها Workspace | اختبار تفضيلات Workspace ولقطات populated |

## Multi-account

يوفر `GET /api/productivity/accounts` قائمة الحساب المحلي واتصالات provider المملوكة للمستخدم، ويعيد `providerAvailability` و`syncStatus` و`lastSyncedAt`. يغير `PATCH /api/productivity/accounts/active` الحساب النشط في PostgreSQL بدل الاعتماد على localStorage فقط. تمرر Inbox وWorkspace `accountId` إلى الاستعلامات، وتتحقق الخدمة من ملكية الاتصال قبل القراءة أو الإنشاء أو التحديث.

العزل لا يعتمد على إخفاء بصري فقط؛ فكل استعلام بريد أو Task أو CalendarEvent أو Follow-up يضم user ownership وaccount scope. البنية provider-neutral في الاستجابة، بينما Gmail هو provider الوحيد الذي يمكن أن يصبح connected عند توفر OAuth حقيقي. Outlook غير مهيأ حاليًا، وSMTP يمثل قناة الإرسال لا حساب مزامنة؛ لذلك لا تعرض الواجهة بيانات مزيفة عند غياب credentials.

## Follow-up Intelligence

المتابعة مرتبطة برسالة مصدر وتحتفظ بتاريخ التذكير والحالة والنسخة. يمكن للمستخدم Snooze أو Complete أو Open conversation. إغلاق waiting-for-reply يحدث في مسار الرد الوارد الحقيقي بعد ثبوت `replyToId` أو `threadId` أو `inReplyTo` أو `References`، مع استبعاد المسودات ورسائل المالك الصادرة.

أُضيف `reconcileOpenFollowUps` كـscheduled reconciliation job داخل scheduler. يستخدم قفل PostgreSQL advisory transaction مستقلًا، يفحص الرسائل الواردة بعد رسالة المصدر ضمن المستخدم والحساب نفسيهما، ويجري conditional update ذريًا؛ لذلك تكون العملية race-safe وidempotent عبر replicas. الاختبار يثبت أن ردًا محفوظًا يغلق متابعة واحدة، وأن التشغيل الثاني لا يغلقها مرة أخرى.

## Offline Workspace للهاتف

يستخدم Flutter `OfflineMutationReplayWorker` تخزينًا مشفرًا في بيئة التطبيق، مع adapter ذاكرة مشترك للاختبارات فقط. تُحفظ آخر Workspace snapshot، وتُصفّ العمليات الآمنة مثل read/star وتغييرات Task وFollow-up وFocus Mode، مع deduplication/coalescing وTTL وretry/backoff و`expectedVersion`. يعيد API حالة 409 عند تعارض النسخة، وتعرض الشاشة حالة offline أو syncing أو conflict أو error بدل إخفاء المشكلة.

الإرسال ليس ضمن safe offline queue؛ يبقى Send عملية صريحة تحتاج اتصالًا وتأكيد المستخدم. اختبارات Flutter تثبت restart من storage مشترك، replay، conflict reconciliation، retry، عدم تسريب Send إلى الطابور، وغياب overflow في المقاسات الضيقة وRTL.

## Privacy Center

تستند صفحة `/privacy-center` إلى `GET/PATCH /api/privacy/center` وتعرض إعدادات منع الصور الخارجية وtracking pixels، الجلسات النشطة، سجل الوصول، وحالات AI وGmail وOutlook وClamAV وPush. التعديلات optimistic في الواجهة مع rollback عند فشل API، وجميع البيانات user-scoped.

حالة التشفير المعروضة هي `transport_only`: HTTPS يوفر تشفير النقل عند تهيئته، ولا يوجد ادعاء End-to-End Encryption. لا تُعرض أي خدمة provider كمتصلة دون شروط الإعداد الفعلية.

## Focus Mode

توجد أوضاع Focus وWork وFollow-up عبر `GET/PATCH /api/productivity/focus`. الوضع يغيّر ما يظهر وما هي الإجراءات السريعة فقط، ولا يحذف البيانات أو يخفيها نهائيًا. اختيار الوضع محفوظ في `workspace_preferences` ويؤثر في Workspace وSmart Inbox، وتظل خيارات الحساب والخصوصية قابلة للوصول من نفس التصميم.

## Schema وOpenAPI

أُضيفت migration append-only:

`artifacts/api-server/prisma/migrations/20260822120000_workspace_accounts_privacy_focus/migration.sql`

وتتضمن account scope للكيانات الإنتاجية والبريد، version للتعارضات، تفضيلات privacy/focus، والفهارس اللازمة للملكية. تمت مواءمة Prisma وDrizzle، وتحقق OpenAPI من 61 مسارًا و63 schema، مع انعكاس account/version/expectedVersion في العقد.

## اللغات وRTL والإتاحة

تم الحفاظ على اللغات الخمس عشرة: English وArabic وSpanish وFrench وGerman وPortuguese وItalian وTurkish وRussian وSimplified Chinese وJapanese وKorean وHindi وIndonesian وUrdu. عناصر الواجهة مترجمة عبر namespaces، بينما تبقى subject/body وأسماء المرسلين وقيم البريد كما هي. العربية والأردية تستخدمان RTL تلقائيًا، وتبقى عناوين البريد LTR، ولا تُعكس الأيقونات الثابتة بلا داعٍ. تمت مراعاة touch targets وreduced motion، واختبرت الواجهة على 390×844 مع فحص overflow وAccessibility.

## الاختبارات والحدود

| المجال | الدليل |
|---|---|
| PostgreSQL/Redis/API | 19 ملفًا و128 اختبارًا ناجحًا على قاعدة PostgreSQL جديدة وRedis معزول، بما فيها multi-account وPrivacy وFocus وreply reconciliation وSSE وWorker/Queue |
| Web E2E | 39 اختبارًا authenticated/RTL/accessibility، وتشمل Workspace وInbox وCompose وAccount switcher وPrivacy وFocus وحالات الهاتف |
| Flutter | 65 اختبارًا ناجحًا مع format وanalyze، وتشمل RTL، النصوص الطويلة، المقاسات الضيقة، cache/replay/conflict |
| Localization/OpenAPI | 15 locale و20 namespace و536 مفتاح English، وOpenAPI: 61 paths و63 schemas |
| Security/build | typecheck، Prisma validation، API/Web production builds، secret scan، TODO validation، و`git diff --check` ناجحة |

لا تستخدم هذه المرحلة بيانات مستخدمين حقيقية أو credentials حقيقية. تبقى AI provider وGmail OAuth وOutlook وFCM وWeb Push وClamAV وBilling بحالة `NOT_CONFIGURED` ما لم تُجهّز خارج Git وبإعدادات آمنة. كما أن تشفير End-to-End ليس جزءًا من هذه المرحلة.
