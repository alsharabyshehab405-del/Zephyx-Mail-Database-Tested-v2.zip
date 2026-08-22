# Zephyx Mail — Beta Readiness Audit

## 1. نطاق المراجعة ومرجع المصدر

أُجريت هذه المراجعة داخل **PR #8** والفرع `feature/brand-identity-ux-polish-v0.8` فقط. كان commit المطلوب مراجعته هو:

```text
406f66be2d47675b7e25a793db2bed54572b4565
```

خلال المراجعة تبيّن أن هذا commit لم يعد HEAD للفرع؛ فالـPR يحتوي على commit لاحق خاص بتصحيح Beta Readiness السابق. لذلك لا أصف `406f66be` بأنه الإصدار الحالي، ولا أُعيد كتابة التاريخ أو أستخدم Force Push. HEAD الفعلي الذي جرى عليه التدقيق والتشغيل هو:

```text
0e76559b04480ba215b5ecdbec2eb180dd031982
```

بقي PR #8 مفتوحًا، وبقي `main` دون تعديل على `0cf7e4d739b28595cd5d4ccad1c798174c2f574f`. لم يُنشأ فرع أو PR جديد، ولم يحدث merge أو Tag أو Release.

## 2. نتيجة التدقيق المختصرة

| المجال | النتيجة | الدليل |
|---|---|---|
| Smart Inbox | يعمل بترتيب قابل للتفسير وإشارات ظاهرة، دون ادعاء تصنيف AI صامت | `docs/zephyx-product-differentiation-v2.md`، Workspace API، Web E2E |
| Unified Workspace | يجمع البريد والمهام والاجتماعات والمسودات والمتابعات ببيانات PostgreSQL | `GET /api/productivity/workspace`، API integration، Playwright |
| تحويل الرسالة | Create Task وCreate Event وFollow-up عبر API وownership checks | productivity controller/service، API وE2E |
| Multi-account | Account switcher مع account-scoped queries وحفظ الحساب النشط في PostgreSQL | `GET/PATCH /api/productivity/accounts`، عزل API وE2E |
| Follow-up Intelligence | Snooze وComplete وفتح المحادثة، وإغلاق بعد رد وارد حقيقي مع reconciliation مجدول | `reconcileOpenFollowUps`، scheduler، API integration |
| Offline Workspace | snapshot cache وpersistent encrypted queue للعمليات الآمنة، replay وretry و409 reconciliation | Flutter offline foundation والاختبارات |
| Privacy Center | controls والجلسات وسجل الوصول وحالات providers مستقلة ومملوكة للمستخدم | `/privacy-center` و`/api/privacy/center` |
| Focus Mode | Focus وWork وFollow-up محفوظة عبر API وتؤثر في العرض دون حذف البيانات | `/api/productivity/focus`، Playwright |
| Compose | To/Cc/Bcc chips والتحقق وReply/Reply All/Forward وDraft/Schedule بحالات حقيقية | Compose API وE2E |
| اللغات وRTL والإتاحة | 15 لغة، RTL للعربية والأردية، reduced motion، touch targets، وفحص 390×844 وaxe | localization validator، Playwright، Flutter |
| Send في Offline queue | غير موجود عمدًا في safe queue؛ الإرسال يتطلب اتصالًا وتأكيد المستخدم | Flutter offline contract والاختبارات |

المنتج يحافظ على هوية Zephyx ومساحة الإنتاجية الخاصة به، ولا يحوّل التصميم إلى نسخة من Gmail أو Outlook.

## 3. Staging والتحقق التشغيلي

استُخدم مسار Staging المعزول الموجود في `.github/workflows/staging-v7.yml`. ينشئ هذا المسار PostgreSQL وRedis وMailpit وخدمات API/Web/Worker/Scheduler مؤقتة، ويستخدم بيانات اختبار اصطناعية داخل بيئة CI فقط. لا تُستخدم بيانات Production أو رسائل مستخدمين حقيقية.

| فحص Staging | الحالة |
|---|---|
| التحقق من `.env.staging.example` | ناجح |
| فحص الملفات المتتبعة للأسرار | ناجح |
| PostgreSQL migrations من بيئة مؤقتة | ناجح |
| Redis connectivity وnamespace المعزول | ناجح |
| API readiness/liveness | ناجح |
| Web health | ناجح |
| Worker readiness | ناجح |
| Scheduler readiness | ناجح |
| Mailpit/SMTP الاختباري | ناجح ضمن smoke harness |
| التسجيل والدخول وتجديد الجلسة | ناجح ضمن smoke harness |
| Draft/Inbox/search/folders | ناجح ضمن smoke harness |
| Redis realtime | ناجح ضمن smoke harness وSSE tests |
| Backup/checksum/restore verification | ناجح في قاعدة مؤقتة معزولة |
| Gmail OAuth وClamAV وFCM وWeb Push وBilling الحقيقي | `NOT_CONFIGURED`، ولم تُستخدم credentials |
| Caddy/TLS العام | غير مُثبت على نطاق عام في هذا التدقيق؛ يتطلب DNS وACME مخصصين لـStaging |

أُعيد تشغيل Staging v7 على HEAD الفعلي بنجاح: [run 32587167495](https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/actions/runs/32587167495). شملت النتيجة المرحلتين `Validate staging environment contract` و`Isolated staging integration`، بما في ذلك smoke tests والتحقق من backup/restore.

## 4. متغيرات البيئة والحدود الأمنية

المصدر المرجعي لمتغيرات البيئة هو `.env.staging.example` و`STAGING_SETUP_CHECKLIST.md`. لا تُحفظ القيم الفعلية في Git أو في التقرير أو في سجلات CI. يجب وضعها في Secret Manager أو ملف خارج المستودع بصلاحيات المالك فقط، مثل `/opt/zephyx-mail/secrets/staging.env` مع `chmod 600`.

يجب أن تكون PostgreSQL وRedis وSMTP وObject Storage وOAuth وwebhook secrets وDNS منفصلة عن Production. ويجب أن يمنع التحقق الصارم القيم الافتراضية والضعيفة وCORS wildcard ونطاقات Production. كما يجب إبقاء `STAGING_TRUST_PROXY` وlimits وqueue prefixes وSSE limits متوافقة مع طبقة الشبكة الفعلية.

## 5. حالة التكاملات غير المهيأة

| التكامل | الحالة المطلوبة في Staging الحالي | سبب عدم اعتبار Fake نجاحًا حقيقيًا |
|---|---|---|
| AI provider | `NOT_CONFIGURED` | لا يوجد `GEMINI_API_KEY` مخصص لـStaging؛ لا يُحتسب `OPENAI_API_KEY` العام الخاص ببيئة الوكيل. |
| Gmail OAuth | `NOT_CONFIGURED` | لا يوجد OAuth client وredirect URI وPub/Sub مخصصة لـStaging. |
| FCM | `NOT_CONFIGURED` | لا يوجد Firebase project/token مخصصان لـStaging. |
| Web Push | `NOT_CONFIGURED` | لا توجد VAPID keys مخصصة ومفعلة لـStaging. |
| ClamAV | `NOT_CONFIGURED` | لا توجد خدمة scanner مخصصة قابلة للوصول؛ attachment upload/download يبقى fail-closed. |
| Billing | `NOT_CONFIGURED` | Fake billing adapter للاختبار لا يعني وجود provider أو webhook حقيقي. |
| Outlook/Graph | `NOT_CONFIGURED` | لا يوجد adapter وOAuth Graph مفعّلان. |
| SMTP | Mailpit اختبارية فقط | SMTP الخارجي الحقيقي يحتاج relay وcredentials مخصصة؛ لا تُرسل رسائل إلى عناوين حقيقية. |

يجب على Privacy Center عرض كل حالة provider بصورة مستقلة، ولا يحق لأي مفتاح بيئة عام أو Fake adapter تحويل الخدمة إلى `connected`.

## 6. نتائج الاختبارات المحلية وCI

| الاختبار أو الفحص | النتيجة |
|---|---:|
| API/PostgreSQL/Redis integration | 128/128، من 19 ملفًا |
| Playwright authenticated functional/accessibility | 39/39 |
| Flutter format/analyze/unit/widget tests | ناجحة في CI؛ 65 اختبارًا |
| Localization validation | 15 locale و20 namespace، ناجح |
| OpenAPI validation/codegen | 61 path و63 schema، ناجح |
| API/Web production build | ناجح |
| Secret scan | ناجح؛ 895 ملفًا متتبعًا |
| SBOM | ناجح؛ 119 component |
| Dependency audit | exit 0 عند high threshold، مع 1 moderate vulnerability يجب متابعتها |
| Container scan | ناجح ضمن Production Security workflow |
| TODO validation و`git diff --check` | ناجح |

بعد تصحيح فجوة provider statuses السابقة، نجح Zephyx Mail CI **ثلاث مرات على نفس HEAD الفعلي**: [المحاولة الأولى](https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/actions/runs/32587167475)، [المحاولة الثانية](https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/actions/runs/32587167475/attempts/2)، [المحاولة الثالثة](https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/actions/runs/32587167475/attempts/3). ونجح [Production v6 Security](https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/actions/runs/32587167476).

## 7. خطوات التشغيل المتبقية فعليًا على Staging

1. إنشاء خادم أو مشروع Staging منفصل، مع Docker Engine وCompose v2 وجدار ناري يمنع PostgreSQL وRedis وSMTP من الوصول العام.
2. إنشاء ملف البيئة خارج المستودع، ضبط `0600`، ثم تشغيل `node scripts/validate-staging-env.mjs <file> --strict` دون طباعة الملف.
3. تشغيل PostgreSQL وRedis وMailpit ثم `staging-migrate`، وبعدها API وWorker وScheduler وWeb.
4. التحقق من `/api/health/live` و`/api/health/ready`، وmarkers الخاصة بالـWorker والـScheduler، ثم تشغيل `scripts/staging-smoke.mjs`.
5. ضبط DNS مخصص لـStaging وتشغيل Caddy فقط بعد جاهزية Web/API؛ لا يمكن إثبات TLS العام قبل توفير DNS وACME email حقيقيين خارج Git.
6. تنفيذ backup بصيغة custom، checksum، وrestore في قاعدة تحقق مؤقتة؛ لا تُجرى الاستعادة على قاعدة المستخدمين العاملة.
7. إبقاء كل adapter خارجي غير مهيأ على `NOT_CONFIGURED`، أو تفعيله لاحقًا فقط بعد تزويده بcredentials مخصصة لـStaging واختبارات ownership/isolation.

## 8. Blockers قبل فتح Beta العام

| Blocker | الحالة | الإجراء المطلوب قبل Beta العام |
|---|---|---|
| TLS وDNS العامان | Blocker تشغيلي | توفير نطاق Staging منفصل، ACME email، والتحقق من Caddy وHSTS وtrusted proxy وCORS allowlist. |
| Secrets وبيانات البيئة | Blocker تشغيلي | تعبئة ملف خارج Git عبر Secret Manager أو مسار محلي محمي، وتشغيل strict validation. |
| SMTP الخارجي | Blocker إذا كان الإرسال الخارجي مطلوبًا | استخدام Mailpit أو relay Staging مخصص، ومنع أي عنوان Production. |
| Gmail OAuth | Blocker لميزة Gmail | OAuth client وPub/Sub وtoken encryption key مخصصة واختبارات عزل الحسابات. |
| ClamAV | Blocker لرفع المرفقات | توفير scanner مخصص؛ يبقى الرفع fail-closed بدونه. |
| FCM/Web Push | Blocker للإشعارات الأصلية | توفير project/VAPID credentials مخصصة واختبار دورة register/rotation/revoke/delivery. |
| Billing | Blocker للفوترة | provider وwebhook secret وendpoint مخصصان؛ Fake provider غير كافٍ. |
| AI provider | Blocker لميزات AI | توفير provider key مخصص؛ غير ذلك يجب أن يبقى `NOT_CONFIGURED`. |
| Outlook/Graph | Blocker لميزة Outlook | تنفيذ/تفعيل OAuth Graph adapter مع اختبارات العزل. |
| Moderate dependency finding | Risk غير حاجب حاليًا | مراجعة الحزمة المتأثرة وتحديثها أو توثيق قبول المخاطر قبل Beta العام. |
| Android native attachment validation | قيد CI | تشغيل Android emulator أو جهاز اختبار حقيقي قبل اعتماد attachment native على الهاتف. |

## 9. المراجع الداخلية

[1]: ../docs/zephyx-product-differentiation-v2.md "Zephyx Product Differentiation v2"
[2]: ../docs/staging-deployment-runbook.md "Staging Deployment Runbook"
[3]: ../STAGING_SETUP_CHECKLIST.md "Staging Setup Checklist"
[4]: ../.github/workflows/staging-v7.yml "Staging v7 workflow"
[5]: ../.github/workflows/production-v6.yml "Production v6 Security workflow"
[6]: ../lib/api-spec/openapi.yaml "OpenAPI contract"
