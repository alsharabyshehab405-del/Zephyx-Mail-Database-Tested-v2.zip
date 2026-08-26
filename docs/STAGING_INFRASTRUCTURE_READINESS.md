# Zephyx Mail — Staging Infrastructure Readiness

**تاريخ الفحص:** 26 أغسطس 2026

## 1. المصدر والنطاق

نُفذت هذه الجولة على المصدر الرسمي المحدد فقط، وعلى فرع العمل الحالي، وبنطاق **Attachment Infrastructure Closure** دون إضافة ميزات مستقلة أو تغيير منطق Threat Protection v1. استُخدمت بيانات وحسابات ورسائل اختبارية فقط، ولم تُستخدم بيانات Production أو أسرار Production.

| البند | القيمة |
|---|---|
| Repository | `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip` |
| Branch | `archive-source-work` |
| Starting / current HEAD | `0133575727ed2a351cc7f712f32dbe84a5442ea0` |
| Commit | لا يوجد |
| Push | NO |
| `main` | لم يُعدّل |
| Production data | لم تُستخدم |

## 2. القرار التنفيذي

أصبح **Object Storage للمرفقات PASS داخل Staging Compose المحلي المعزول**. يعمل MinIO كخدمة S3-compatible فعلية، مع volume دائم، bucket خاص، healthcheck، وتهيئة private policy. نجح المسار الحقيقي `upload → ClamAV INSTREAM → MinIO → read → download → send`، ونجحت اختبارات عزل المستخدم والمؤسسة.

هذا لا يساوي جاهزية Public Beta أو Production. ما زالت DNS/TLS/ACME العامة، Caddy runtime الفعلي، وexternal SMTP غير مهيأة. كما أن الاختبار داخل هذا sandbox احتاج override مؤقتًا بـhost networking لأن kernel يمنع اتصال Docker bridge؛ هذا override لم يُضف إلى المستودع ولا يمثل إعداد المنتج الدائم.

> **الحكم:** Private Beta محلية مع المرفقات ممكنة على هذه البيئة الاختبارية. Public Beta غير معتمدة حتى استكمال edge/TLS والبنية التشغيلية المشتركة واختبار Compose networking على مضيف Staging حقيقي.

## 3. MinIO وObject Storage

أُضيفت خدمة `staging-object-storage` في `docker-compose.staging.yml` باستخدام صورة MinIO مثبتة الإصدار `minio/minio:RELEASE.2025-04-22T22-12-26Z`. تستخدم الخدمة volume دائمًا باسم `staging_object_storage_data`، وتملك healthcheck على `/minio/health/live`، وتنشر API/Console على loopback فقط. تُنشئ خدمة one-shot باسم `staging-object-storage-init` bucket مخصصًا وتضبط anonymous access إلى `private`.

يُفعل مسار S3 فقط عند اكتمال المتغيرات الستة المطلوبة، دون تخزين على قرص API:

| المتغير | الاستخدام |
|---|---|
| `S3_ENDPOINT` | MinIO endpoint داخل Compose أو endpoint S3 خارجي مخصص |
| `S3_REGION` | منطقة S3 |
| `S3_BUCKET` | bucket Staging المخصص |
| `S3_ACCESS_KEY` | credential خارج Git |
| `S3_SECRET_KEY` | credential خارج Git |
| `S3_FORCE_PATH_STYLE` | توافق MinIO path-style |

لم تُحفظ أي قيمة فعلية لهذه المتغيرات في Git؛ أُحدّث `.env.staging.example` بالـschema والقيم placeholder فقط. أُضيف validator صارم يتحقق من اكتمال إعداد S3، صحة endpoint، bucket غير الفارغ، Boolean الخاص بـpath style، وقوة credentials عند استخدام strict mode.

يستخدم adapter مكتبة `@aws-sdk/client-s3` ولا يملك fallback إلى local disk. يبقى Replit App Storage مسارًا توافقياً عند غياب S3، بينما يبقى in-memory map محصورًا في `NODE_ENV=test` المعلّم. بيانات object تُخزن بصيغة `NOVAMAIL_B64_V1:` للحفاظ على compatibility مع read behavior الموجود.

مفاتيح التخزين الفعلية تتبع النمط:

```text
<environment>/organizations/<organizationId>/users/<userId>/attachments/<attachmentId>
```

أثبت فحص PostgreSQL أن **79/79** سجل attachment يطابق environment وorganizationId وownerUserId داخل `storage_key`. وأثبت MinIO listing وجود **79 object** في bucket وقت الفحص. لا تظهر credentials في paths أو التقارير.

## 4. ClamAV وfail-closed

تعمل خدمة `staging-clamav` من الصورة المثبتة `clamav/clamav:1.5.3`، مع volume دائم لتواقيع `/var/lib/clamav` وhealthcheck باستخدام `clamdscan --ping`. في Compose الفعلي كانت الخدمة `healthy`، وأعاد اتصال TCP المحلي `PONG`.

يُنفذ الفحص قبل `writeAttachmentObject`. verdict نظيف يسمح بالانتقال إلى MinIO، وEICAR يُرفض بـ422، وتعذر scanner يُرفض بـ503. لا يُخزّن المرفق قبل نجاح scan. اختبارات policy والـINSTREAM وfail-closed نجحت، ولم يتغير منطق Threat Protection v1.

| الحالة | النتيجة الفعلية |
|---|---|
| Clean عبر ClamAV INSTREAM | PASS؛ قبول clean verdict |
| EICAR عبر ClamAV INSTREAM | PASS؛ infected verdict |
| Scanner unavailable | PASS؛ fail-closed وHTTP 503 في الاختبار المركز |
| EICAR object creation | PASS؛ MinIO object count بقي 3 قبل وبعد الرفض |

## 5. المسار الحقيقي للمرفقات

أُعيد بناء API وWorker بعد تطبيق migration الجديدة، ثم شُغلا مع MinIO وClamAV وPostgreSQL وRedis وMailpit. جميع خدمات Compose الأساسية كانت healthy أو running، ونجحت health endpoints للـMinIO وAPI وWorker readiness وMailpit.

| المسار | النتيجة |
|---|---|
| Clean upload | PASS؛ HTTP 201 |
| Owner read | PASS؛ HTTP 200 وbyte-for-byte match |
| Owner download | PASS؛ HTTP 200 و`Content-Disposition: attachment` وbyte match |
| Send with attachment | PASS؛ HTTP 201 |
| Sent listing | PASS؛ الرسالة ذات المرفق ظهرت في Sent |
| Organization A upload/read | PASS؛ 201 ثم 200 |
| Wrong organization read | PASS؛ 404 |
| Other user read داخل Organization A | PASS؛ 404 |

## 6. رفض الملفات الخطرة

أُجريت الحالات على endpoint API الحقيقي، إضافة إلى اختبارات parser/security المركزية. لا تُعتبر filename path traversal نجاحًا عبر الرفض فقط؛ السلوك الصحيح هو sanitization إلى basename آمن.

| الحالة | النتيجة |
|---|---|
| MIME mismatch | PASS؛ HTTP 415 |
| Executable `MZ` | PASS؛ HTTP 415 |
| ZIP signature/archive | PASS؛ HTTP 415 |
| ZIP bomb ratio | PASS؛ HTTP 415 |
| Encrypted ZIP | PASS؛ HTTP 415 |
| ZIP path traversal | PASS؛ HTTP 415 |
| Filename path traversal | PASS؛ HTTP 201 بعد sanitization إلى `escape.pdf` |
| Magic bytes مقابل declared MIME | PASS في security suite |
| Office Open XML structure | PASS في security suite؛ fake/encrypted structures مرفوضة |

## 7. عزل المؤسسة والمستخدم وحدوده

أضيف `organization_id` إلى metadata table مع default `personal` وindex مركب على `(organization_id, owner_user_id)`. يمرر upload endpoint قيمة `X-Organization-Id` الاختيارية، ويفرض membership عبر `getOrganizationAccess` قبل الرفع. read/delete يفرضان نفس organization scope، وownership checks السابقة ما زالت مطبقة.

الاختبار الفعلي أنشأ مؤسستين، رفع المستخدم المالك مرفقًا في Organization A، ثم نجح الوصول من A وفشل الوصول من Organization B ومن مستخدم آخر بحالة 404. هذا يثبت عزل object metadata/key والمسارات الحالية. لكنه لا يثبت وجود organization column على `emails` نفسها؛ لذلك تبقى **رسائل email data plane user-scoped أساسًا**، ويجب عدم وصف هذه الجولة بأنها RLS أو عزل مؤسسي كامل لكل جداول المنتج.

## 8. Backup/restore لـObject Storage

نُفذ mirror فعلي من bucket MinIO إلى مساحة مؤقتة، ثم أُنشئ tar checksum، وأُنشئ restore bucket مؤقت، وأُعيدت objects إليه، ثم نُزّلت إلى مساحة مستقلة. قورنت SHA-256 لكل مسار نسبي قبل وبعد الاستعادة.

| القياس | النتيجة |
|---|---|
| Objects في snapshot النسخ | 3 |
| Objects بعد restore | 3 |
| Per-object SHA-256 comparison | PASS؛ لا فروق |
| Tar SHA-256 للاختبار | `1c4f647d4eba265de883592577a445d60d1e04af130cedbbd1122527e31f7927` |
| Restore bucket/data cleanup | PASS |
| Git backup data | لم يُحفظ أي backup في Git |

## 9. Compose وhealth وMailpit

طُبقت **23 migration** بنجاح على قاعدة PostgreSQL جديدة تمامًا، بما فيها `20260826110000_attachment_s3_object_storage`. كانت خدمات PostgreSQL وRedis وClamAV وMinIO وMailpit وAPI وWorker وScheduler متاحة في Stack الاختبار.

| الفحص | النتيجة |
|---|---|
| MinIO live/ready | 200 / 200 |
| API live/ready | 200 / 200 |
| Worker readiness | 200 |
| Mailpit API | 200 |
| Bucket anonymous policy | `private` |
| SMTP sink محلي | PASS؛ Staging-only |
| External SMTP relay | NOT_CONFIGURED |

Mailpit المحلي وSMTP sink لا يمثلان external SMTP delivery أو reputation أو TLS authentication. لم تُرسل رسائل إلى عناوين حقيقية.

## 10. الاختبارات

| المجموعة | النتيجة الفعلية |
|---|---|
| Fresh PostgreSQL migrations | 23/23 migrations PASS |
| Full Integration | **22 files / 144 tests PASS** |
| API unit/Jest | **1 suite / 3 tests PASS** |
| Attachment security + Threat Protection targeted | **3 files / 20 tests PASS** |
| Real attachment API probe | **19 assertions PASS** |
| Dangerous attachment API probe | **4/4 PASS** |
| EICAR no-object-created check | PASS؛ 3 objects قبل وبعد |
| Playwright attachment/Compose/Workspace/RTL/Accessibility selected | **39/39 PASS** |
| Unfiltered Playwright 41-test run | 37 PASS، 1 FAIL، 3 did not run؛ الفشل في اختبارين provider-state يتوقعان SMTP/ClamAV `NOT_CONFIGURED` رغم تهيئتهما، مع serial skip لاحق |
| TypeScript monorepo | PASS |
| Production build | PASS؛ web chunk warning غير حاجب |
| OpenAPI | PASS؛ 76 paths و77 schemas |
| Prisma validate/generate | PASS |
| Secret scan | PASS؛ 949 tracked files |
| SBOM | PASS؛ 120 components |
| Dependency audit | PASS؛ لا vulnerabilities عالية معروفة |

الاختبار الكامل المعتمد على المرفق في `global-foundation.spec.ts` نجح، كما نجحت اختبارات Reply/Reply All/Forward التي ترفع fixture attachment. اختبارات العربية واللغات الخمس عشرة، RTL، accessibility، Workspace، Compose، الهاتف 390×844، وoffline-related UI contracts نجحت ضمن الجولة المحددة. الاختباران غير المتوافقين مع هذه البيئة لا يفشلان attachment pipeline؛ إنما يفرضان الحالة القديمة التي يكون فيها SMTP وClamAV غير مهيأين.

## 11. الخدمات `NOT_CONFIGURED` والقيود المتبقية

| الخدمة أو capability | الحالة |
|---|---|
| Caddy 2.9+ runtime الفعلي | NOT_CONFIGURED في هذا sandbox |
| DNS وPublic TLS/ACME | NOT_CONFIGURED |
| External SMTP relay/credentials | NOT_CONFIGURED |
| Gmail OAuth | NOT_CONFIGURED |
| Outlook/Graph | NOT_CONFIGURED |
| FCM | NOT_CONFIGURED |
| Web Push | NOT_CONFIGURED |
| Billing | NOT_CONFIGURED |
| AI provider | NOT_CONFIGURED |
| Public edge / production monitoring | NOT_CONFIGURED |
| MinIO Object Storage داخل Staging Compose | **PASS** |
| ClamAV داخل Staging Compose | **PASS** |
| Mailpit المحلي | **PASS للاختبار فقط** |

المتبقي قبل Staging مشترك أو Public Beta هو توفير DNS/TLS/ACME وCaddy مطابق للإصدار، اعتماد مضيف Docker لا يعاني من bridge networking limitation، وتقرير موارد طويل المدى يشمل CPU/RAM/PG connections/slow queries/Redis/queue/SSE. لا يوجد blocker متبقٍ في upload/read/download/send للمرفقات داخل Stack الاختبار المحلي.

## 12. حالة Git والتنظيف

لم يُنشأ Commit ولم يُنفذ Push، ولم يتغير `main`. التغييرات الحالية محلية وتشمل adapter S3، metadata/migration، Compose/ClamAV/MinIO، validator، focused tests، والتقارير. لا توجد أسرار حقيقية أو `node_modules` أو build artifacts متتبعة. ستُوقف خدمات الاختبار وتُحذف بيانات الاختبار والملفات المؤقتة قبل التسليم.

**الخلاصة:** Object Storage للمرفقات مغلق بنجاح كخدمة MinIO S3-compatible داخل Staging Compose المحلي، مع ClamAV INSTREAM وfail-closed وownership checks وbackup/restore checksum. لا يُسمح باعتبار ذلك Public Beta أو external SMTP/TLS readiness قبل إغلاق القيود التشغيلية المذكورة أعلاه.

## References

[1]: ../docker-compose.staging.yml "Staging Compose definition"
[2]: ../scripts/validate-staging-env.mjs "Strict Staging environment validator"
[3]: ../artifacts/api-server/src/lib/attachment-storage.ts "S3-compatible attachment storage adapter"
[4]: ../artifacts/api-server/src/lib/attachment-security.ts "Attachment validation and ClamAV INSTREAM policy"
[5]: ../artifacts/api-server/prisma/migrations/20260826110000_attachment_s3_object_storage/migration.sql "Append-only attachment metadata migration"
[6]: ../tests/e2e/global-foundation.spec.ts "Global functional and attachment-dependent Playwright coverage"
[7]: ../tests/e2e/productivity-deep.spec.ts "Productivity and attachment-dependent Playwright coverage"
[8]: ../artifacts/api-server/src/lib/security-reliability.test.ts "Attachment security and storage-key tests"
