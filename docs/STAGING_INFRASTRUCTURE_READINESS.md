# Zephyx Mail — Staging Infrastructure Readiness

**تاريخ الجولة:** 27 أغسطس 2026 — Provider Activation & Real Staging Verification
**Repository:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`
**Branch:** `archive-source-work`
**HEAD المحلي والبعيد:** `0826683c54d943c00f117b8c05563b8bb9bb872a`
**Commit/Push:** NO / NO

## الحكم التنفيذي

تم تجهيز والتحقق من إعدادات Staging على المصدر الرسمي فقط باستخدام ملفات خارجية مؤقتة بصلاحية `0600`. نجح strict validator و`docker compose config --quiet`. شُغّلت PostgreSQL وRedis وClamAV وMinIO وMailpit الحقيقية كخدمات محلية؛ ونجح API host-wired في المسار الكامل للمرفقات. لم تُفعّل أي خدمة AI أو URL Intelligence أو Attachment Sandbox خارجية لغياب credentials حقيقية.

**Full Docker Compose application stack مصنف BLOCKED بيئيًا** في هذه sandbox، لأن Docker bridge لا يمرر TCP بين service containers؛ ظهرت المشكلة في probes مستقلة إلى PostgreSQL وRedis وClamAV وMinIO، وفشل معها one-shot migration وbucket-init. لم يُعدّل Compose الرسمي لإخفاء القيد، واستُخدم override خارج Git فقط لإثبات التطبيق عبر المنافذ المضيفة.

## الحالة حسب التصنيف

| التصنيف | العناصر |
|---|---|
| **PASS** | strict env validation، Compose config، PostgreSQL، Redis، MinIO، ClamAV INSTREAM، Mailpit، migrations، API health، attachment flow، isolation، quality/security checks. |
| **NOT_CONFIGURED** | AI provider، URL Intelligence provider، Attachment Sandbox، external SMTP، DNS، Caddy/TLS/ACME، Gmail، Outlook، FCM، Web Push، Billing، public monitoring. |
| **BLOCKED** | Full Compose inter-container networking، Flutter SDK، edge/TLS العام. |
| **FAILED** | لا يوجد فشل وظيفي متبقٍ في API host-wired attachment flow؛ فشل bucket-init داخل Compose سببه network blocker وليس فشل MinIO نفسه. |

## الأسرار والإعدادات

لم تُحفظ credentials أو tokens في Git أو CI، ولم تُطبع القيم في logs أو التقرير. استخدمت الجولة ملفات `/tmp` خارج المستودع بصلاحية `0600` فقط. القالب `.env.staging.example` يحتوي schema وplaceholders، ويعرّف حقول AI وURL وSandbox وClamAV وS3 دون أسرار فعلية.

| الفحص | النتيجة |
|---|---|
| `validate-staging-env.mjs /tmp/zephyx-provider-gate.env --strict` | **PASS**؛ AI/URL/Sandbox = not configured، ClamAV = configured محليًا |
| `docker compose --env-file ... config --quiet` | **PASS** |
| Secret scan | **PASS**؛ 1046 tracked files |
| Compose provider wiring | **PASS**؛ الحقول الاختيارية تمرر إلى API فقط وفق Compose، ولا توجد credentials في الملفات المتتبعة |

## الخدمات الحقيقية

| الخدمة | نتيجة التحقق |
|---|---|
| PostgreSQL 16 | **PASS**؛ healthy، و25 migration من قاعدة فارغة |
| Redis 7.4 | **PASS**؛ healthy، realtime وBullMQ integration |
| MinIO | **PASS** كخدمة S3-compatible حقيقية وhost-wired؛ bucket خاص وobject roundtrip |
| ClamAV 1.5.3 | **PASS**؛ daemon حقيقي عبر INSTREAM، clean وEICAR |
| Mailpit | **PASS للاختبار فقط**؛ SMTP sink محلي، بلا external relay |
| API | **PASS host-wired محدود**؛ liveness/readiness وreal attachment flow |
| Worker/Scheduler | **PASS في الاختبارات**؛ full Compose runtime blocked |
| Caddy/DNS/TLS | **NOT_CONFIGURED** |

## Attachment Security

الترتيب الفعلي هو: التحقق من الملف، ثم ClamAV INSTREAM، ثم الكتابة إلى MinIO، ثم metadata. لا يُخزّن أو يُرسل المرفق قبل clean verdict. نجح clean upload ثم read/download/send، ونجح checksum. رُفض EICAR بـHTTP 422، ورُفض MIME mismatch وexecutable وZIP bomb وencrypted ZIP وZIP path traversal بـHTTP 415. عند تشغيل API ثانية مع ClamAV غير متاح، رُفض clean upload بـHTTP 503، مثبتًا fail-closed.

مفاتيح التخزين تتضمن البيئة والمؤسسة والمستخدم والمرفق:

```text
<environment>/organizations/<organizationId>/users/<userId>/attachments/<attachmentId>
```

اختبار عزل فعلي أنشأ مؤسستين ومستخدمين، وسمح بالقراءة للمالك داخل scope الصحيح، ورفض cross-organization وother-user بحالة 404، ثم نفّذ cleanup.

## قياس المسارات المصادق عليها

| Route | Requests | Concurrency | Errors | P50 | P95 |
|---|---:|---:|---:|---:|---:|
| Inbox | 20 | sequential sample | 0 | 5.84 ms | 18.38 ms |
| Attachment read | 20 | sequential sample | 0 | 8.01 ms | 11.24 ms |

هذه عينة readiness صغيرة وليست capacity benchmark. لا توجد نتيجة موثوقة ل10k/100k/1M مستخدم، ولا ادعاء latency إنتاجية أو SSE متعدد النسخ.

## Smoke وHealth

نجح smoke الرسمي بمتغيرات `STAGING_*` المتسقة في **20 PASS و4 NOT_CONFIGURED** بعد إعادة تشغيله عقب نجاح backup/restore. شملت النتائج liveness/readiness، التسجيل وتسجيل الدخول وتجديد الجلسة، Inbox/folders، attachment upload/download، drafts، Mailpit send، search/filters، notifications، Redis realtime والـone-time ticket، Worker/Redis readiness، ClamAV scanning، وbackup/restore.

## Local Completion Gate

| الفحص | النتيجة النهائية |
|---|---|
| `pnpm run staging:validate` وstrict validation | **PASS**؛ القالب والملف الخارجي 0600 صالحان، والمزودات الخارجية غير مهيأة |
| `pnpm run staging:seed` | **PASS**؛ مستخدمان صناعيان بعناوين `example.invalid` فقط |
| `pnpm run staging:smoke` النهائي | **20 PASS / 4 NOT_CONFIGURED** بعد backup/restore |
| `pnpm run load:test` | **PASS**؛ 50/50 طلبًا إلى `/api/health/live`، failures=0، P95=2.92 ms؛ ليس اختبار سعة أو مسارًا مصادقًا |
| Backup/restore | **PASS**؛ checksum، custom-format restore إلى قاعدة مستقلة، user count match، ثم حذف قاعدة الهدف |

## الاختبارات

| المجموعة | النتيجة |
|---|---|
| Full Integration | **26 files / 164 tests PASS** |
| API Jest | **1 suite / 3 tests PASS** |
| Security/AI focused | **2 files / 20 tests PASS** في الجولة الحالية؛ الجولة السابقة **4 files / 21 tests PASS**، والفرق موثق في `docs/SECURITY_AI_TEST_COMPARISON.md` باعتباره اختلاف run set بلا فشل. |
| Playwright | **43/43 PASS بالتغطية المركبة**؛ 41 مع الخدمات المحلية و2 مع provider-status غير المهيأ، و15 لغة وRTL وAccessibility و390×844 وCompose/Workspace/security UI |
| TypeScript وbuild | **PASS**؛ chunk warning غير مانع |
| OpenAPI/codegen | **PASS**؛ 83 paths و89 schemas |
| Prisma | **PASS**؛ validate/generate و25 migration من قاعدة فارغة |
| Localization | **PASS**؛ 15 locale، 21 namespace، 631 English keys، RTL للعربية والأردية |
| Secret scan/SBOM/audit | **PASS**؛ 1046 tracked files، 120 components، ولا high-or-higher vulnerabilities معروفة |
| Flutter | **BLOCKED / NOT RUN**؛ SDK غير مثبت |

## Blockers قبل Shared Staging وPublic Beta

يجب إعادة التشغيل على مضيف Staging فعلي لا يعاني من Docker bridge blocker، ثم تشغيل API/Worker/Scheduler داخل topology نفسها. يلزم إعداد Caddy وDNS وTLS/ACME وexternal SMTP إن كان الإرسال الخارجي مطلوبًا، وتفعيل provider خارجي حقيقي فقط بعد توفير credentials وconsent وretention/DPA. يلزم تثبيت Flutter وتشغيله مباشرة من `mobile/novamail-flutter`، وإجراء حمل طويل مصادق عليه مع CPU/RAM/PG connections/slow queries/Redis/queue/SSE metrics.

## حالة Git والتنظيف

لم يُنفذ Commit أو Push، ولم يتغير `main` أو PR #8. لم تدخل ملفات الأسرار أو node_modules أو build artifacts أو logs أو البيانات المؤقتة إلى Git. تم إيقاف الخدمات وحذف volumes وقواعد وملفات `/tmp` المؤقتة بعد انتهاء التحقق.

## Staging Activation Preflight — 27 أغسطس 2026

مرّ قالب `.env.staging.example` عبر `pnpm run staging:validate` في schema/example mode. لا يوجد ملف Secret Store أو ملف Staging خارجي حاليًا، لذلك strict external validation مصنف **NOT_CONFIGURED**. فشل `docker compose config --quiet` بالقالب وحده بسبب القيم المطلوبة خارج Git مثل `S3_ACCESS_KEY`، وهذا مصنف **BLOCKED** في preflight وليس فشلًا في التطبيق. Docker Engine 29.1.3 وCompose 2.40.3 متاحان، وCaddy binary مثبت، بينما DNS CLI وFlutter/Dart غير متاحة. لم يُشغّل startup أو `/api/health/ready` أو smoke أو provider smoke في هذه الجولة لغياب Secret Store؛ لا توجد نتائج خارجية مخترعة.

## Global Product Completion — Local Only (27 أغسطس 2026)

أضيفت طبقة محلية للحجر والسياسات والحملات والتعلم وطلبات الخصوصية والموافقات، دون تعديل Compose أو ClamAV INSTREAM أو MinIO. migration جديدة append-only ومسارات `/api/enterprise/completion` وOpenAPI/codegen وtypecheck **PASS**. لا تُشغّل هذه الإضافة AI أو URL Intelligence أو Sandbox خارجيًا؛ هذه الخدمات **NOT_CONFIGURED**. أي اختبار API/Integration جديد يحتاج PostgreSQL اختبارية يصنف **BLOCKED** عند غياب قاعدة محلية، ولا تُستخدم Mock لإخفاء ذلك.

## المراجع

[1]: ../docker-compose.staging.yml "Staging Compose topology"
[2]: ../scripts/validate-staging-env.mjs "Strict Staging environment validator"
[3]: ../scripts/staging-smoke.mjs "Canonical Staging smoke checks"
[4]: ../artifacts/api-server/src/lib/attachment-security.ts "ClamAV INSTREAM and fail-closed policy"
[5]: ../artifacts/api-server/src/lib/attachment-storage.ts "S3-compatible Object Storage adapter"
[6]: ../artifacts/api-server/src/modules/emails/attachments.service.ts "Attachment ownership and organization checks"
