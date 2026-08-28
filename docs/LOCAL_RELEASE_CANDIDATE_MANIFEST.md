# Local Release Candidate Manifest

**المصدر الرسمي:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`

**الفرع:** `archive-source-work`

**HEAD المحلي والمتتبع عند بدء الجرد:** `0826683c54d943c00f117b8c05563b8bb9bb872a`

**نطاق المرحلة:** جرد وتصنيف ومراجعة اتساق فقط. لم يُنفذ حذف أو Reset أو checkout لاستعادة ملفات، ولم يُنشأ Commit أو Push.

## تحديث مراجعة Release Candidate

أُعيد جرد الشجرة في هذه المراجعة قبل أي تعديل، فكانت تحتوي على **68 مسارًا**: 25 مسارًا معدّلًا و43 مسارًا غير متتبع. أُبقيت جميع المسارات كما هي؛ إضافة هذا التحديث لا تغيّر أي ملف برمجي. يبقى `docs/STAGING_CAPACITY_LOAD_REPORT.md` مستبعدًا عمدًا.

الاقتراح المحافظ بعد المراجعة هو **59 مسارًا** لCommit مستقبلي: 53 مسار تنفيذ/اختبار/مخطط/هجرة/مولدات/Flutter، و6 تقارير canonical هي `AI_PHISHING_DETECTION_REPORT.md` و`STAGING_INFRASTRUCTURE_READINESS.md` و`GLOBAL_PRODUCT_COMPLETION_LOCAL_REPORT.md` و`LOCAL_VERIFICATION_RECOVERY_REPORT.md` و`FLUTTER_RUNTIME_VERIFICATION_REPORT.md` وهذا الـManifest. وتبقى **9 مسارات محلية أو تاريخية** خارج هذا الاقتراح: 8 تقارير متداخلة أو تمهيدية، إضافة إلى ملف السعة المستبعد عمدًا.

إذا استُبعد الـManifest نفسه باعتباره وثيقة قرار، يصبح المرشح المحافظ **58 مسارًا**. أما إدراج كل المسارات الحالية باستثناء ملف السعة فيعطي **67 مسارًا**، لكنه ليس الاقتراح الموصى به بسبب تداخل التقارير التاريخية. هذه أعداد تخطيطية فقط وليست Commit.

## 1. نقطة الجرد

قبل إنشاء هذا الملف، كانت الشجرة تحتوي على **67 مسارًا محليًا غير ملتزم**: 25 مسارًا معدّلًا و42 مسارًا غير متتبع. أُضيف هذا الـManifest نفسه بعد الجرد، لذلك يصبح عدد المسارات في `git status --short` بعد إنشائه **68 مسارًا**. لا ينبغي اعتبار إضافة التقرير تغييرًا برمجيًا.

لم يظهر Reset أو انتقال إلى `main` في آخر 250 سجلًا من reflog، والـremote-tracking HEAD مطابق للـHEAD المحلي.

## 2. التصنيف التفصيلي للمسارات

### A. Production Security Engine — مرشحة مستقبلًا

| الحالة | المسار |
|---|---|
| مرشح | `artifacts/api-server/src/lib/production-config.ts` |
| مرشح اختبار | `artifacts/api-server/src/lib/production-launch-v6.test.ts` |
| مرشح اختبار/تكامل | `artifacts/api-server/src/modules/security/ai-phishing.integration.test.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/security/security-engine.service.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/security/url-intelligence.service.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/security/security.controller.ts` |
| مرشح مصدر/اختبار API | `artifacts/api-server/src/__tests__/api.test.ts` |
| مرشح مصدر خصوصية | `artifacts/api-server/src/modules/privacy/privacy.controller.ts` |

### B. Global Product Completion — مرشحة مستقبلًا

| الحالة | المسار |
|---|---|
| مرشح مصدر | `artifacts/api-server/src/modules/enterprise/global-completion.service.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/enterprise/global-completion.controller.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/enterprise/security-dashboard.service.ts` |
| مرشح مصدر | `artifacts/api-server/src/modules/security/security-feedback.service.ts` |
| مرشح مصدر wiring | `artifacts/api-server/src/routes/index.ts` |
| مرشح contract test | `artifacts/api-server/src/lib/webhook-signature.test.ts` |
| مرشح مصدر | `artifacts/api-server/src/lib/webhook-signature.ts` |
| مرشح schema export | `lib/db/src/schema/index.ts` |
| مرشح schema | `lib/db/src/schema/global_completion.ts` |

### C. Migration رقم 26 — مرشحة مستقبلًا بعد موافقة صريحة

| الحالة | المسار |
|---|---|
| مرشح migration append-only | `artifacts/api-server/prisma/migrations/20260827100000_global_product_completion/` |

المجلد يحتوي على SQL للهجرات الجديدة الخاصة بـquarantine وenterprise policies وspam learning وthreat campaigns وprivacy requests وconsent records. جرى التحقق من وجود **26 مجلد migration**، وأن هذا هو migration الأحدث ورقم 26. لم تُعدّل الهجرات السابقة.

### D. Generated OpenAPI/clients — مرشحة مستقبلًا إذا أُدرجت مواصفة OpenAPI

| الحالة | المسار |
|---|---|
| مصدر العقد | `lib/api-spec/openapi.yaml` |
| مولد | `lib/api-client-react/src/generated/api.schemas.ts` |
| مولد | `lib/api-client-react/src/generated/api.ts` |
| مولد | `lib/api-zod/src/generated/api.ts` |
| مولد | `lib/api-zod/src/generated/types/index.ts` |
| مولد | `lib/api-zod/src/generated/types/securityEngineResponse.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/campaignCorrelationInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/consentInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/enterprisePolicyInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/enterprisePolicyInputAttachmentAction.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/enterprisePolicyInputLinkAction.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/enterprisePolicyInputScope.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/enterprisePolicyInputSenderAction.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/globalCompletionCollection.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/globalCompletionObject.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/policyEvaluationInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/policyEvaluationInputSignal.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/privacyRequestInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/privacyRequestInputRequestType.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/quarantineInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAccountScopedSignals.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAccountScopedSignalsFeedback.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignals.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsDkim.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsDmarc.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseAuthenticationSignalsSpf.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseCampaignSignals.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseCampaignSignalsScope.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseSenderReputation.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/securityEngineResponseSenderReputationState.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/spamLearningInput.ts` |
| مولد جديد | `lib/api-zod/src/generated/types/spamLearningInputFeedbackType.ts` |

تُعد هذه الملفات ضرورية فقط مع `openapi.yaml` المطابق؛ لا ينبغي قبول مولدات منفصلة عن العقد. التحقق الحالي أعطى **93 paths و98 schemas**، ونجح `openapi:check` وcodegen.

### E. Flutter Accessibility — مرشحة مستقبلًا، مع حظر runtime

| الحالة | المسار |
|---|---|
| مرشح Semantics | `mobile/novamail-flutter/lib/features/compose/screens/compose_screen.dart` |
| مرشح Semantics | `mobile/novamail-flutter/lib/features/inbox/screens/inbox_screen.dart` |
| مرشح Semantics | `mobile/novamail-flutter/lib/features/productivity/screens/productivity_dashboard_screen.dart` |

تغييرات هذه الملفات تخص Semantics وlive regions وحالات loading/error/empty. Flutter/Dart SDK غير مثبت، ولذلك لا يوجد إثبات compile أو runtime؛ يجب عدم اعتمادها نهائيًا قبل تشغيل `flutter pub get`, `flutter analyze`, و`flutter test` مباشرة من المشروع.

### F. Staging Preparation والوثائق التشغيلية — توثيق مرشح، لا تفعيل

| الحالة | المسار |
|---|---|
| توثيق مرشح | `docs/STAGING_INFRASTRUCTURE_READINESS.md` |
| توثيق مرشح | `docs/BETA_READINESS_REPORT.md` |
| توثيق مرشح | `docs/SCALABILITY_READINESS_REPORT.md` |
| توثيق مرشح | `docs/STAGING_ACTIVATION_PREFLIGHT.md` |
| توثيق مرشح | `docs/STAGING_PREREQUISITES_CHECKLIST.md` |

هذه الملفات لا تفعّل Staging ولا تحتوي credentials. يجب الحفاظ على الفصل بين إثبات host-wired المحلي وبين full Compose topology وReal Staging.

### G. Local Verification وFlutter/Release reports — توثيق تدقيقي يحتاج قرار توحيد

| الحالة | المسار |
|---|---|
| توثيق تدقيقي | `docs/PRODUCTION_SECURITY_ENGINE_COMPLETION_REPORT.md` |
| توثيق تدقيقي | `docs/SECURITY_AI_TEST_COMPARISON.md` |
| توثيق تدقيقي | `docs/GLOBAL_PRODUCT_COMPLETION_LOCAL_REPORT.md` |
| توثيق تدقيقي | `docs/LOCAL_VERIFICATION_RECOVERY_REPORT.md` |
| توثيق تدقيقي | `docs/MOBILE_RELEASE_HARDENING_LOCAL_REPORT.md` |
| توثيق تدقيقي | `docs/FLUTTER_MOBILE_ACCESSIBILITY_CLOSURE_REPORT.md` |
| توثيق تدقيقي | `docs/FLUTTER_RUNTIME_VERIFICATION_REPORT.md` |

هذه التقارير ليست code artifacts، لكنها تحفظ provenance ونتائج الجولات. توجد موضوعات متداخلة بينها، لذلك تحتاج قرار المستخدم لاحقًا: إبقاء كل سجل تاريخي، أو اعتماد تقرير canonical واحد لكل مرحلة وأرشفة الباقي. لم أعدّل أو أحذف أيًا منها.

### H. الملف المستبعد عمدًا

| الحالة | المسار | سبب الاستبعاد |
|---|---|---|
| **مستبعد عمدًا** | `docs/STAGING_CAPACITY_LOAD_REPORT.md` | ملف سابق طلب المستخدم إبقاءه خارج الرفع/Commit. لم أعدّله ولم أحذفه. |

## 3. قائمة مستقبلية مقترحة للـCommit

إذا وافق المستخدم لاحقًا على إدراج **كل المسارات الحالية باستثناء `docs/STAGING_CAPACITY_LOAD_REPORT.md`**، فعدد المسارات المتوقع دخوله هو **67 مسارًا**: حالة Git الحالية ذات 68 مسارًا ناقصًا ملف السعة المستبعد عمدًا. وإذا استُبعد هذا الـManifest نفسه باعتباره وثيقة قرار، يصبح العدد **66 مسارًا**. هذه أرقام تخطيطية وليست Commit منفذًا.

القائمة المحافظة التي ينبغي مراجعتها أولًا هي: كود Production Security Engine، كود Global Product Completion، اختبار webhook، migration رقم 26، مخطط Drizzle، `openapi.yaml`، جميع مخرجات codegen المتطابقة مع العقد، وملفات Flutter الثلاثة. أما التقارير فتُدرج فقط بعد قرار واضح بشأن الاحتفاظ بكل السجل التاريخي أو توحيده.

لا توجد ملفات مؤقتة أو `node_modules` أو build artifacts أو `.env` حقيقية ضمن الجرد. لا ينبغي إضافة أي ملف مستقبلي من `/tmp` أو من نتائج Playwright إلى Release Candidate.

## 4. قرارات المستخدم المطلوبة

1. اعتماد أو استبعاد كل التقارير التاريخية المتداخلة بدل حذفها تلقائيًا.
2. اعتماد مخرجات codegen الجديدة باعتبارها ناتجة عن `openapi.yaml` الحالي.
3. الإبقاء على `docs/STAGING_CAPACITY_LOAD_REPORT.md` خارج أي Commit كما طُلب سابقًا.
4. عدم اعتماد Flutter النهائي قبل توفر SDK وتشغيل runtime الحقيقي.
5. مراجعة migration رقم 26 قبل أي Commit أو تطبيق على بيئة غير اختبارية.

## 5. نتائج الاتساق والفحوص

| الفحص | النتيجة |
|---|---|
| Drizzle مقابل Prisma migration | **PASS بنيوي**: schema الجديد يطابق عائلات الجداول والـenums في migration رقم 26، والهجرات السابقة append-only |
| Migration count | **PASS: 26** |
| OpenAPI | **PASS: 93 paths و98 schemas** |
| OpenAPI/codegen | **PASS** |
| Routes/Controllers/Services | **PASS بنيوي**: Router completion مسجل، والـcontroller/service/dashboard موجودة |
| Smoke result | **PASS موحد سابقًا: 20 PASS / 4 NOT_CONFIGURED** بعد backup/restore؛ لا يُخلط مع الجولة القديمة 19/5 |
| Security/AI comparison | **متسق تاريخيًا**: 4 files/21 tests و2 files/20 tests مجموعتان مختلفتان؛ الجولة الحالية أعادت 4 files/21 tests |
| Localization | **PASS ثابتًا**: 15 لغة مع RTL للعربية والأردية؛ Flutter runtime منفصل ومُصنف BLOCKED |
| Secret scan | **PASS** |
| `git diff --check` | **PASS** |

## 6. الاقتراح المستقبلي لرسالة Commit

`feat(security): consolidate local release candidate security and enterprise completion`

هذه الرسالة اقتراح فقط. لم يُنشأ Commit ولم يُنفذ Push.

## 7. التصنيف النهائي

**PASS:** الاتساق البنيوي للمخطط والهجرة، OpenAPI/codegen، wiring للمسارات والخدمات، وفحوص الجودة السابقة/المعادة محليًا كما هو موضح أعلاه.

**NOT_CONFIGURED:** AI Provider، URL Intelligence Provider، Attachment Sandbox الخارجي، SMTP الخارجي، DNS/TLS/Caddy العام، Public Monitoring، وحسابات التكامل الخارجي.

**BLOCKED:** Flutter/Dart runtime، Real Staging Activation، وProvider smoke الخارجي لغياب SDK/الموارد/credentials.

**FAILED:** لا يوجد فشل وظيفي مثبت في هذه الجولة. أي اختلاف في أرقام التقارير مصنف كتاريخ جولة أو اختيار test-set وليس regression.
