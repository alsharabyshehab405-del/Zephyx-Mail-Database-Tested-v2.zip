# Release Candidate Selection — Dry-Run

**المصدر الرسمي:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`

**الفرع:** `archive-source-work`

**HEAD المتحقق:** `0826683c54d943c00f117b8c05563b8bb9bb872a`

**النطاق:** اختيار محلي فقط. لم يُستخدم `git add` أو staging فعلي، ولم يُنفذ Commit أو Push، ولم تُحذف أو تُعدّل الملفات المستبعدة.

## القرار النهائي

اعتمدت القائمة المحافظة على `docs/LOCAL_RELEASE_CANDIDATE_MANIFEST.md` مع استبعاد ملفات Flutter الثلاثة لأن Flutter/Dart runtime لم يُشغّل، واستبعاد التقارير التاريخية المتداخلة و`docs/STAGING_CAPACITY_LOAD_REPORT.md` وفق القرار السابق.

الخيار الموصى به هو **56 مسارًا** قبل احتساب هذا التقرير الجديد. يتكون من **50 مسار تنفيذ/اختبار/هجرة/مولدات/Schema غير Flutter**، و**5 تقارير canonical**، و`docs/LOCAL_RELEASE_CANDIDATE_MANIFEST.md` كوثيقة ضبط للإصدار.

الخيار البديل هو **55 مسارًا** إذا اعتُبر `docs/LOCAL_RELEASE_CANDIDATE_MANIFEST.md` وثيقة قرار محلية لا تدخل Commit. الفرق بين 56 و55 هو هذا الملف وحده؛ لا يوجد اختلاف في كود التطبيق أو الهجرة أو العملاء المولدين.

هذا التقرير `docs/RELEASE_CANDIDATE_SELECTION.md` يبقى **محليًا وغير محسوب** في الرقمين 56 و55؛ فهو ناتج dry-run مستقل. إذا تقرر إدراجه مستقبلًا، يجب إعادة حساب القائمة صراحة بدل staging تلقائي.

## القائمة الكاملة — الخيار الموصى به 56

### 1. ملفات التنفيذ والاختبار والهجرة والمولدات وSchema — 50 مسارًا

| # | المسار |
|---:|---|
| 1 | `artifacts/api-server/src/__tests__/api.test.ts` |
| 2 | `artifacts/api-server/src/lib/production-config.ts` |
| 3 | `artifacts/api-server/src/lib/production-launch-v6.test.ts` |
| 4 | `artifacts/api-server/src/modules/enterprise/security-dashboard.service.ts` |
| 5 | `artifacts/api-server/src/modules/privacy/privacy.controller.ts` |
| 6 | `artifacts/api-server/src/modules/security/ai-phishing.integration.test.ts` |
| 7 | `artifacts/api-server/src/modules/security/security-engine.service.ts` |
| 8 | `artifacts/api-server/src/modules/security/security-feedback.service.ts` |
| 9 | `artifacts/api-server/src/modules/security/security.controller.ts` |
| 10 | `artifacts/api-server/src/modules/security/url-intelligence.service.ts` |
| 11 | `artifacts/api-server/src/routes/index.ts` |
| 12 | `artifacts/api-server/prisma/migrations/20260827100000_global_product_completion/` |
| 13 | `artifacts/api-server/src/lib/webhook-signature.test.ts` |
| 14 | `artifacts/api-server/src/lib/webhook-signature.ts` |
| 15 | `artifacts/api-server/src/modules/enterprise/global-completion.controller.ts` |
| 16 | `artifacts/api-server/src/modules/enterprise/global-completion.service.ts` |
| 17 | `lib/db/src/schema/index.ts` |
| 18 | `lib/db/src/schema/global_completion.ts` |
| 19 | `lib/api-spec/openapi.yaml` |
| 20 | `lib/api-client-react/src/generated/api.schemas.ts` |
| 21 | `lib/api-client-react/src/generated/api.ts` |
| 22 | `lib/api-zod/src/generated/api.ts` |
| 23 | `lib/api-zod/src/generated/types/index.ts` |
| 24 | `lib/api-zod/src/generated/types/securityEngineResponse.ts` |
| 25 | `lib/api-zod/src/generated/types/campaignCorrelationInput.ts` |
| 26 | `lib/api-zod/src/generated/types/consentInput.ts` |
| 27 | `lib/api-zod/src/generated/types/enterprisePolicyInput.ts` |
| 28 | `lib/api-zod/src/generated/types/enterprisePolicyInputAttachmentAction.ts` |
| 29 | `lib/api-zod/src/generated/types/enterprisePolicyInputLinkAction.ts` |
| 30 | `lib/api-zod/src/generated/types/enterprisePolicyInputScope.ts` |
| 31 | `lib/api-zod/src/generated/types/enterprisePolicyInputSenderAction.ts` |
| 32 | `lib/api-zod/src/generated/types/globalCompletionCollection.ts` |
| 33 | `lib/api-zod/src/generated/types/globalCompletionObject.ts` |
| 34 | `lib/api-zod/src/generated/types/policyEvaluationInput.ts` |
| 35 | `lib/api-zod/src/generated/types/policyEvaluationInputSignal.ts` |
| 36 | `lib/api-zod/src/generated/types/privacyRequestInput.ts` |
| 37 | `lib/api-zod/src/generated/types/privacyRequestInputRequestType.ts` |
| 38 | `lib/api-zod/src/generated/types/quarantineInput.ts` |
| 39 | `lib/api-zod/src/generated/types/securityEngineResponseAccountScopedSignals.ts` |
| 40 | `lib/api-zod/src/generated/types/securityEngineResponseAccountScopedSignalsFeedback.ts` |
| 41 | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignals.ts` |
| 42 | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsDkim.ts` |
| 43 | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsDmarc.ts` |
| 44 | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsSpf.ts` |
| 45 | `lib/api-zod/src/generated/types/securityEngineResponseCampaignSignals.ts` |
| 46 | `lib/api-zod/src/generated/types/securityEngineResponseCampaignSignalsScope.ts` |
| 47 | `lib/api-zod/src/generated/types/securityEngineResponseSenderReputation.ts` |
| 48 | `lib/api-zod/src/generated/types/securityEngineResponseSenderReputationState.ts` |
| 49 | `lib/api-zod/src/generated/types/spamLearningInput.ts` |
| 50 | `lib/api-zod/src/generated/types/spamLearningInputFeedbackType.ts` |

### 2. التقارير canonical — 5 مسارات

| # | المسار | سبب الإدراج |
|---:|---|---|
| 51 | `docs/AI_PHISHING_DETECTION_REPORT.md` | التقرير canonical لـProduction Security Engine وAI provider state |
| 52 | `docs/STAGING_INFRASTRUCTURE_READINESS.md` | التقرير canonical للبنية وClamAV/MinIO وStaging boundaries |
| 53 | `docs/GLOBAL_PRODUCT_COMPLETION_LOCAL_REPORT.md` | التقرير canonical لـGlobal Product Completion |
| 54 | `docs/LOCAL_VERIFICATION_RECOVERY_REPORT.md` | التقرير canonical لاستعادة التحقق المحلي |
| 55 | `docs/FLUTTER_RUNTIME_VERIFICATION_REPORT.md` | يسجل Flutter BLOCKED / NOT RUN وحدود runtime دون ادعاء نجاح |

### 3. وثيقة ضبط الإصدار — مسار واحد

| # | المسار | سبب الإدراج |
|---:|---|---|
| 56 | `docs/LOCAL_RELEASE_CANDIDATE_MANIFEST.md` | يثبت provenance والجرد السابق وقواعد الاستبعاد |

## الملفات المستبعدة مؤقتًا

### Flutter — 3 مسارات

| المسار | السبب |
|---|---|
| `mobile/novamail-flutter/lib/features/compose/screens/compose_screen.dart` | Flutter/Dart runtime غير متاح؛ لا يوجد pub get/analyze/test |
| `mobile/novamail-flutter/lib/features/inbox/screens/inbox_screen.dart` | السبب نفسه؛ Semantics غير مثبتة بالتجميع أو runtime |
| `mobile/novamail-flutter/lib/features/productivity/screens/productivity_dashboard_screen.dart` | السبب نفسه؛ لا يُعتمد قبل SDK فعلي |

### تقارير تاريخية أو متداخلة — 8 مسارات

| المسار | السبب |
|---|---|
| `docs/BETA_READINESS_REPORT.md` | سجل Beta أوسع ومتداخل؛ يبقى محليًا حتى قرار اعتماد canonical |
| `docs/SCALABILITY_READINESS_REPORT.md` | سجل Scalability منفصل ولا يلزم لقائمة RC الأمنية الحالية |
| `docs/PRODUCTION_SECURITY_ENGINE_COMPLETION_REPORT.md` | سجل مرحلة سابق متداخل مع تقرير AI canonical |
| `docs/SECURITY_AI_TEST_COMPARISON.md` | provenance لاختلاف test-set؛ يبقى مرجع تدقيقي محليًا |
| `docs/MOBILE_RELEASE_HARDENING_LOCAL_REPORT.md` | سجل مرحلة Mobile سابق متداخل مع Flutter runtime report |
| `docs/FLUTTER_MOBILE_ACCESSIBILITY_CLOSURE_REPORT.md` | سجل Accessibility سابق؛ لا يُحذف ويُراجع بعد توفر SDK |
| `docs/STAGING_ACTIVATION_PREFLIGHT.md` | preflight تاريخي وليس جزءًا من runtime RC |
| `docs/STAGING_PREREQUISITES_CHECKLIST.md` | checklist تشغيلية خارج قائمة الكود المرشح |

### مستبعد عمدًا — مسار واحد

| المسار | السبب |
|---|---|
| `docs/STAGING_CAPACITY_LOAD_REPORT.md` | سبق طلب المستخدم إبقاءه خارج الرفع/Commit؛ لم يُعدّل أو يُحذف |

إجمالي المستبعد: **12 مسارًا**، منها 3 Flutter و9 وثائق. 68 مسارًا حاليًا ناقصًا 12 يعطي **56**.

## الاتساق

| الفحص | النتيجة |
|---|---|
| Drizzle مقابل migration رقم 26 | **PASS بنيوي**؛ عائلات الجداول والـenums متطابقة، والهجرات السابقة لم تُمس |
| عدد الهجرات | **PASS: 26**، والجديد `20260827100000_global_product_completion` |
| OpenAPI | **PASS: 93 paths و98 schemas** |
| Routes/Controllers/Services | **PASS بنيوي**؛ completion router والـcontroller والـservices والـdashboard مربوطون |
| العملاء والأنواع المولدة | **PASS** بعد codegen؛ المخرجات مرتبطة بـ`openapi.yaml` الحالي |
| التقارير والأرقام | **متسقة بحسب الجولة**؛ smoke canonical السابق 20 PASS/4 NOT_CONFIGURED، وSecurity/AI التاريخية 4/21 مقابل 2/20 لاختلاف test-set |
| التوطين | **PASS ثابتًا**؛ 15 لغة وRTL للعربية والأردية، مع Flutter runtime غير مثبت |

## الفحوص الآمنة

| الفحص | النتيجة |
|---|---|
| `git diff --check` | **PASS** |
| Secret scan | **PASS**؛ 1046 ملفًا متتبعًا |
| TypeScript | **PASS** |
| Build | **PASS**؛ تحذير chunk-size غير مانع |
| OpenAPI validation/codegen | **PASS**؛ 93 paths و98 schemas |
| Prisma validate | **PASS** باستخدام مرجع صناعي محلي غير متصل |
| SBOM | **PASS**؛ 120 مكوّنًا |
| Dependency audit | **PASS**؛ offline بلا known vulnerabilities |
| Flutter/Dart | **BLOCKED / NOT RUN**؛ لا SDK |

لم تُشغّل PostgreSQL أو Redis أو Playwright في dry-run هذا لأن المطلوب فحوص آمنة فقط، ولأن الاختبارات المحلية الكاملة موثقة في جولات Recovery السابقة. لا تُعد skipped أو mock أو fixture تكاملًا خارجيًا ناجحًا.

## الحالة التشغيلية

تبقى AI Provider وURL Intelligence Provider وAttachment Sandbox الخارجي وSMTP وDNS/TLS وPublic Monitoring والحسابات الخارجية **NOT_CONFIGURED**. لم تُستخدم Fake AI أو Fake Scanner، ولم يحدث اتصال خارجي. ClamAV fail-closed وMinIO وRBAC والعزل لم تُغيّر.

## اقتراح Commit مستقبلي

`feat(security): select local release candidate for security completion`

الاقتراح لا ينفذ staging ولا Commit. يجب الحصول على موافقة صريحة قبل أي `git add` أو Commit، مع إبقاء ملف السعة خارج القائمة. خيار 56 هو الموصى به، وخيار 55 أكثر تحفظًا إذا بقي Manifest محليًا.

## التصنيف

**PASS:** الاتساق البنيوي، migration رقم 26، OpenAPI/codegen، generated clients/types، routes/controllers/services، والفحوص الآمنة المذكورة.

**NOT_CONFIGURED:** المزودات الخارجية، SMTP، DNS/TLS، Monitoring، وأي حسابات تكامل.

**BLOCKED:** Flutter/Dart runtime، وأي تحقق Mobile runtime أو provider smoke خارجي.

**FAILED:** لا يوجد فشل وظيفي مثبت في فحوص dry-run؛ لا توجد ملفات مؤقتة أو أسرار ضمن قائمة Git.
