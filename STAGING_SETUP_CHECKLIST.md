# Zephyx Mail — STAGING_SETUP_CHECKLIST

## 1. هوية الوثيقة وحدودها

هذه الوثيقة مخصصة لتشغيل **Zephyx Mail Staging & Beta Readiness v7** من الإصدار `v0.7.0-staging-ready`، والمثبت على Merge Commit `a744e7e24474435aa99afd27abd8fe7447df3b5a`. وهي لا تنشئ بيئة Production ولا تستبدل إجراءاتها.

> **قاعدة أمنية غير قابلة للتفاوض:** لا تضع أسرارًا أو مفاتيح أو كلمات مرور أو رموز OAuth/FCM/Web Push/Billing في هذه الوثيقة أو في GitHub أو في سجلات CI. خزّن القيم الفعلية في Secret Manager أو ملف محلي غير متتبع بصلاحيات `0600`.

يجب أن تكون PostgreSQL وRedis وSMTP وOAuth وObject Storage وwebhook secrets وDNS الخاصة بـStaging منفصلة عن Production. لا تنسخ بيانات مستخدمين أو رسائل أو مرفقات حقيقية إلى Staging. لا تستخدم نطاق Production أو قواعده أو Redis namespace الخاص به.

### حالة القبول الحالية

| البند | الحالة التشغيلية |
|---|---|
| Zephyx Mail Staging v7 | مُصدر في `v0.7.0-staging-ready` |
| Smoke tests | 16 ناجحة في CI |
| SMTP | Mailpit للاختبار، وليس SMTP إنتاجيًا |
| Redis realtime | مُختبر عبر SSE وone-time ticket |
| Backup/restore | تم التحقق في قاعدة Staging معزولة داخل CI |
| Gmail OAuth | `NOT_CONFIGURED` حتى توفير OAuth client مخصص لـStaging |
| ClamAV | `NOT_CONFIGURED`؛ رفع وتنزيل المرفقات fail-closed بدونه |
| FCM | `NOT_CONFIGURED` |
| Web Push | `NOT_CONFIGURED` |
| Billing | `NOT_CONFIGURED`؛ لا تُستخدم webhooks إنتاجية |

> `NOT_CONFIGURED` ليست فشلًا في الاختبارات. معناها أن التكامل الخارجي معطل عمدًا ولم تُستخدم له credentials حقيقية.

## 2. المتطلبات المسبقة وعزل الخادم

قبل البدء، جهّز مضيفًا أو مشروعًا منفصلًا عن Production يعمل عليه Docker Engine وDocker Compose v2. امنع الوصول العام إلى PostgreSQL وRedis وSMTP؛ اسمح بالوصول الإداري عبر VPN أو bastion فقط. افتح على الحافة 80 و443 عند الحاجة إلى HTTPS العام، ولا تنشر منفذ PostgreSQL أو Redis أو API مباشرة على الإنترنت.

استخدم volumes وشبكات Docker منفصلة. يعتمد Compose على شبكة `staging_backend` الداخلية لخدمات PostgreSQL وRedis وSMTP وAPI وWorker وScheduler، وعلى `staging_edge` لخدمات Web وCaddy. لا تعِد استخدام volumes أو buckets أو Redis prefixes من Production.

ثبّت الإصدار المطلوب دون تتبع الفرع المحذوف:

```bash
git clone --branch v0.7.0-staging-ready --depth 1 \
  https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip.git
cd Zephyx-Mail-Database-Tested-v2

git rev-parse HEAD
# يجب أن يطبع: a744e7e24474435aa99afd27abd8fe7447df3b5a
```

ثبّت Node.js 24 وpnpm 11.21.0 كما في CI، ثم ثبّت الاعتماديات:

```bash
pnpm install --frozen-lockfile
```

## 3. جدول متغيرات البيئة

انسخ `.env.staging.example` إلى مخزن أسرار أو إلى ملف محلي غير متتبع باسم `.env.staging`. الأمثلة أدناه **وهمية وغير صالحة للتشغيل**. استبدلها في Secret Manager فقط، ولا تلصق القيم الفعلية في المحادثة أو في Pull Request.

**معنى Required:** يجب أن يكون المفتاح موجودًا، ويجب أن تكون قيمته صالحة في وضع `--strict` إذا كان مستخدمًا في المسار الفعال. **معنى Optional:** يمكن تركه على القيمة الافتراضية أو فارغًا، أو يصبح مطلوبًا فقط عند تفعيل الميزة المذكورة.

### 3.1 الهوية والعناوين والأمان العام

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_ENVIRONMENT` | يثبت أن البيئة هي Staging | Required | قيمة ثابتة يضبطها المشغل | `production` |
| `STAGING_DATA_NAMESPACE` | namespace لعزل البيانات | Required | يولده المشغل لكل بيئة | `production` |
| `STAGING_APP_DOMAIN` | نطاق التطبيق في Staging | Required | DNS مخصص لـStaging | `staging.example.invalid` |
| `STAGING_APP_BASE_URL` | العنوان العام الذي يستخدمه API | Required | DNS/عنوان داخلي Staging | `https://staging.example.invalid` |
| `STAGING_WEB_URL` | عنوان Web وOrigin المتوقع | Required | DNS/عنوان Web Staging | `https://staging.example.invalid` |
| `STAGING_ALLOWED_ORIGINS` | قائمة CORS صريحة | Required | نطاق Web Staging فقط | `*` |
| `STAGING_API_PORT` | منفذ API المنشور محليًا | Optional | قيمة تشغيل محلية، الافتراضي `3500` | `not-a-port` |
| `STAGING_WEB_PORT` | منفذ Web المنشور محليًا | Optional | قيمة تشغيل محلية، الافتراضي `3300` | `not-a-port` |
| `STAGING_CADDY_HTTP_PORT` | منفذ HTTP للحافة | Optional | إعداد المضيف، الافتراضي `80` | `eighty` |
| `STAGING_CADDY_HTTPS_PORT` | منفذ HTTPS للحافة | Optional | إعداد المضيف، الافتراضي `443` | `four-four-three` |
| `STAGING_ACME_EMAIL` | بريد ACME لإشعارات الشهادة | Conditional | بريد مخصص لـStaging | `not-an-email` |
| `STAGING_TLS_MODE` | نمط TLS، مثل `external` أو `local` | Optional | قرار تشغيل البيئة | `unknown-mode` |
| `STAGING_TRUST_PROXY` | عدد proxies الموثوقة خلف API | Optional | طبقة الشبكة | `many` |
| `STAGING_REQUEST_BODY_LIMIT_BYTES` | الحد الأقصى لجسم الطلب | Optional | سياسة Staging | `ten-megabytes` |
| `STAGING_ENABLE_SECURITY_HEADERS` | تفعيل security headers | Optional | سياسة الأمان، الافتراضي `true` | `maybe` |
| `STAGING_ENABLE_RATE_LIMITING` | تفعيل rate limiting | Optional | سياسة الأمان، الافتراضي `true` | `sometimes` |
| `STAGING_LOG_LEVEL` | مستوى سجلات الخدمة | Optional | سياسة المراقبة، مثل `info` | `all-secrets` |

### 3.2 PostgreSQL

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_PGHOST` | اسم خدمة/مضيف PostgreSQL المعزول | Required | Docker service أو DNS داخلي | `production-db` |
| `STAGING_PGPORT` | منفذ PostgreSQL | Required | إعداد PostgreSQL Staging | `not-a-port` |
| `STAGING_PGUSER` | مستخدم قاعدة Staging | Required | يُنشأ في PostgreSQL Staging | `root-production` |
| `STAGING_PGPASSWORD` | كلمة مرور مستخدم Staging | Required | Secret Manager | `NOT_A_REAL_SECRET` |
| `STAGING_PGDATABASE` | اسم قاعدة Staging | Required | يُنشأ لبيئة Staging | `production` |
| `STAGING_DATABASE_URL` | اتصال Prisma/Drizzle بالقاعدة | Required | يُركب من Secret Manager | `postgresql://invalid-target` |
| `STAGING_PGSSLMODE` | نمط TLS لاتصال PostgreSQL | Optional | سياسة قاعدة البيانات | `no-such-mode` |

يجب أن تكون `STAGING_DATABASE_URL` متجهة إلى قاعدة Staging فقط، وألا تُسجل في shell history أو CI logs. لا تستخدم `prisma db push`، ولا تعدّل migrations تاريخية.

### 3.3 Redis وBullMQ وSSE

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_REDIS_HOST` | مضيف Redis المعزول | Required | Docker service أو DNS داخلي | `production-redis` |
| `STAGING_REDIS_PORT` | منفذ Redis | Required | إعداد Redis Staging | `redis-port` |
| `STAGING_REDIS_PASSWORD` | كلمة مرور Redis | Required | Secret Manager | `change-me` |
| `STAGING_REDIS_URL` | اتصال BullMQ وRedis realtime | Required | يُركب من Secret Manager | `redis://invalid-target` |
| `STAGING_REDIS_TLS` | تفعيل TLS لـRedis | Optional | سياسة شبكة Staging | `maybe` |
| `STAGING_QUEUE_PREFIX` | namespace للـqueues | Required | اسم فريد لكل بيئة | `production-queues` |
| `STAGING_RATE_LIMIT_REDIS_PREFIX` | namespace للـrate limiting | Optional | مشتق من namespace Staging | `production:ratelimit` |
| `STAGING_SSE_ENABLED` | تفعيل SSE | Optional | سياسة realtime، الافتراضي `true` | `sometimes` |
| `STAGING_SSE_MAX_CONNECTIONS_PER_USER` | حد اتصالات SSE للمستخدم | Optional | سياسة حماية الخدمة | `unlimited` |
| `STAGING_SSE_REPLAY_LIMIT` | حد replay للأحداث | Optional | سياسة replay | `many-events` |
| `STAGING_SSE_HEARTBEAT_MS` | فترة heartbeat بالميلي ثانية | Optional | سياسة اتصال SSE | `often` |

لا تشارك `STAGING_QUEUE_PREFIX` أو Redis database مع Production. إذا استُخدم Redis مُدار، اجعل ACL وTLS وnetwork policy مخصصة لـStaging.

### 3.4 المصادقة والجلسات و2FA

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_JWT_ACCESS_SECRET` | توقيع access tokens | Required | مولد أسرار داخل Secret Manager | `short-secret` |
| `STAGING_JWT_REFRESH_SECRET` | توقيع refresh tokens | Required | مولد أسرار مستقل | `same-secret` |
| `STAGING_SESSION_IP_HASH_SECRET` | hashing آمن لمعلومات الجلسة | Required | مولد أسرار مستقل | `password` |
| `STAGING_TWO_FACTOR_ENCRYPTION_KEY` | تشفير أسرار 2FA | Conditional | Secret Manager؛ مطلوب إذا 2FA مفعلة | `abcdef` |
| `STAGING_TWO_FACTOR_ISSUER` | اسم issuer الظاهر في تطبيقات 2FA | Optional | اسم المنتج في Staging | `unknown` |
| `STAGING_JWT_ACCESS_EXPIRY` | مدة access token | Optional | سياسة جلسات Staging | `forever` |
| `STAGING_COOKIE_SECURE` | تقييد cookie إلى HTTPS | Optional | يجب أن يكون `true` مع HTTPS | `maybe` |
| `STAGING_COOKIE_SAME_SITE` | سياسة SameSite للcookie | Optional | سياسة الجلسات | `anything` |
| `STAGING_ENABLE_2FA` | تفعيل 2FA | Optional | قرار Beta | `sometimes` |

في وضع `--strict` يجب أن تكون أسرار JWT والجلسة بطول وقوة كافيين، وألا تكون قيمًا افتراضية أو متكررة. لا تستخدم السر نفسه لأكثر من غرض، ولا تضع أسرارًا في `.env.staging.example`.

### 3.5 SMTP وMailpit

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_SMTP_HOST` | مضيف Mailpit أو relay Staging | Required | Docker service `staging-smtp` أو relay مخصص | `production-smtp` |
| `STAGING_SMTP_PORT` | منفذ SMTP | Required | إعداد Mailpit/relay | `smtp-port` |
| `STAGING_SMTP_SECURE` | استخدام TLS في SMTP | Optional | إعداد relay | `maybe` |
| `STAGING_SMTP_USER` | مستخدم SMTP | Optional | حساب relay Staging | `real-production-user` |
| `STAGING_SMTP_PASS` | كلمة مرور SMTP | Optional | Secret Manager لحساب relay | `not-a-password` |
| `STAGING_SMTP_FROM` | عنوان From المسموح في Staging | Required | عنوان نطاق Staging | `not-an-email` |
| `STAGING_SMTP_CONNECTION_TIMEOUT_MS` | مهلة إنشاء الاتصال | Optional | سياسة SMTP، الافتراضي `10000` | `ten-seconds` |
| `STAGING_SMTP_GREETING_TIMEOUT_MS` | مهلة greeting | Optional | سياسة SMTP، الافتراضي `10000` | `wait-forever` |
| `STAGING_SMTP_SOCKET_TIMEOUT_MS` | مهلة socket | Optional | سياسة SMTP، الافتراضي `15000` | `no-timeout` |
| `STAGING_TEST_SMTP_UI_URL` | رابط Mailpit UI للفحص اليدوي | Optional | عنوان داخلي/محلي | `not-a-url` |

استخدم Mailpit الافتراضي للاختبارات، وتحقق من الرسائل في UI أو API دون إرسالها إلى عناوين حقيقية. يجب أن تبقى مهلات SMTP ضمن `STAGING_JOB_TIMEOUT_MS` أو أن تُدار بآلية lease renewal في Worker؛ لا تدّعِ أن `AbortSignal` يلغي Nodemailer ما لم يثبت ذلك باختبار فعلي.

### 3.6 Gmail OAuth وPub/Sub

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_ENABLE_GMAIL` | تفعيل Gmail في Staging | Required | قرار Beta | `sometimes` |
| `STAGING_GOOGLE_CLIENT_ID` | OAuth client ID لـStaging | Conditional | Google Cloud project منفصل | `fake-client` |
| `STAGING_GOOGLE_CLIENT_SECRET` | OAuth client secret لـStaging | Conditional | Secret Manager من project منفصل | `fake-secret` |
| `STAGING_GOOGLE_REDIRECT_URI` | callback مسجل في OAuth client | Conditional | إعداد Google OAuth وDNS Staging | `https://wrong.invalid/callback` |
| `STAGING_GMAIL_TOKEN_ENCRYPTION_KEY` | تشفير refresh tokens | Conditional | Secret Manager | `short-key` |
| `STAGING_GMAIL_PUBSUB_OIDC_AUDIENCE` | audience للتحقق من Pub/Sub | Conditional | إعداد Pub/Sub Staging | `wrong-audience` |
| `STAGING_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL` | حساب خدمة Pub/Sub | Conditional | Google Cloud project Staging | `not-an-email` |
| `STAGING_GMAIL_PROVIDER_STATUS` | حالة تكامل Gmail | Required for reporting | يضبط إلى `not_configured` عند التعطيل | `configured-when-disabled` |

إذا كان `STAGING_ENABLE_GMAIL=false`، اترك التكامل معطلًا واجعل `STAGING_GMAIL_PROVIDER_STATUS=not_configured`. لا تستخدم Gmail OAuth حقيقيًا قبل توفير client مخصص لـStaging واختبار عزل الحسابات والـrouting.

### 3.7 ClamAV والمرفقات

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_ATTACHMENT_SCANNING_ENABLED` | تفعيل فحص malware قبل حفظ المرفق | Required | قرار أمني لـStaging | `enabled-maybe` |
| `STAGING_CLAMAV_HOST` | مضيف ClamAV المعزول | Conditional | خدمة/شبكة ClamAV Staging | `production-clamav` |
| `STAGING_CLAMAV_PORT` | منفذ ClamAV | Conditional | إعداد ClamAV | `clam-port` |
| `STAGING_ATTACHMENT_MAX_COUNT` | الحد الأقصى لعدد المرفقات | Optional | سياسة المنتج، الافتراضي `10` | `unlimited` |
| `STAGING_ATTACHMENT_MAX_SIZE_BYTES` | الحد الأقصى للمرفق الواحد | Optional | سياسة المنتج، الافتراضي `26214400` | `twenty-five-mb` |
| `STAGING_ATTACHMENT_MAX_TOTAL_SIZE_BYTES` | الحد الأقصى الإجمالي للمرفقات | Optional | سياسة المنتج، الافتراضي `52428800` | `fifty-mb` |
| `STAGING_CLAMAV_STATUS` | حالة تكامل ClamAV | Required for reporting | `not_configured` عند التعطيل | `configured-when-disabled` |

إذا كان ClamAV غير متوفر، يجب أن يبقى رفع المرفقات **fail-closed** ويظهر في تقرير الاختبار `NOT_CONFIGURED`. لا تتجاوز scanner ولا تحولها إلى `AllowAllTestAttachmentScanner` في تشغيل Staging الحقيقي.

### 3.8 الإشعارات وFCM وWeb Push

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_ENABLE_NOTIFICATIONS` | تفعيل دورة الإشعارات | Required | قرار Beta | `sometimes` |
| `STAGING_NOTIFICATION_PROVIDER` | provider مثل `fake` | Required | إعداد Staging | `unknown-provider` |
| `STAGING_NOTIFICATION_TOKEN_ENCRYPTION_KEY` | تشفير tokens المسجلة | Conditional | Secret Manager عند تفعيل الإشعارات | `short-key` |
| `STAGING_FCM_ENABLED` | تفعيل FCM | Required | قرار Beta | `maybe` |
| `STAGING_FCM_PROJECT_ID` | مشروع FCM لـStaging | Conditional | Firebase project منفصل | `production-project` |
| `STAGING_FCM_ACCESS_TOKEN` | token مؤقت لخدمة FCM | Conditional | Secret Manager من FCM Staging | `not-a-token` |
| `STAGING_FCM_STATUS` | حالة تكامل FCM | Required for reporting | `not_configured` عند التعطيل | `configured-when-disabled` |
| `STAGING_WEB_PUSH_ENABLED` | تفعيل Web Push | Required | قرار Beta | `maybe` |
| `STAGING_WEB_PUSH_VAPID_PUBLIC_KEY` | مفتاح VAPID العام | Conditional | مولد VAPID لـStaging | `fake-public-key` |
| `STAGING_WEB_PUSH_VAPID_PRIVATE_KEY` | مفتاح VAPID الخاص | Conditional | Secret Manager | `fake-private-key` |
| `STAGING_WEB_PUSH_STATUS` | حالة Web Push | Required for reporting | `not_configured` عند التعطيل | `configured-when-disabled` |

الافتراضي الآمن هو Fake notification adapter في الاختبارات. إذا غابت credentials، اختبر register/rotation/revoke/preferences وdelivery records محليًا، وسجّل provider الخارجي كـ`NOT_CONFIGURED`.

### 3.9 Billing

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_ENABLE_BILLING` | تفعيل Billing | Required | قرار Beta | `sometimes` |
| `STAGING_BILLING_PROVIDER` | provider؛ `fake` للاختبار | Required | إعداد Staging | `unknown-provider` |
| `STAGING_BILLING_DEFAULT_PLAN` | الخطة الافتراضية | Optional | إعداد منتج Staging | `production-enterprise` |
| `STAGING_BILLING_TRIAL_DAYS` | مدة التجربة بالأيام | Optional | سياسة Beta | `many-days` |
| `STAGING_BILLING_WEBHOOK_SECRET` | سر webhook لـStaging | Conditional | Secret Manager من provider مخصص | `not-a-webhook-secret` |
| `STAGING_BILLING_WEBHOOK_BASE_URL` | endpoint webhook في Staging | Optional | DNS/API Staging | `https://production.invalid/webhook` |
| `STAGING_BILLING_STATUS` | حالة Billing | Required for reporting | `not_configured` عند التعطيل | `configured-when-disabled` |

لا تفعل Billing الحقيقي مع provider وهمي، ولا تستخدم webhook secret أو endpoint من Production.

### 3.10 Worker وScheduler ودورة حياة العمليات

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_WORKER_CONCURRENCY` | عدد Jobs المتزامنة في Worker | Required | سياسة الحمل، الافتراضي `3` | `many-workers` |
| `STAGING_QUEUE_MAX_ATTEMPTS` | الحد الأقصى للمحاولات | Required | سياسة retry، الافتراضي `3` | `retry-forever` |
| `STAGING_QUEUE_BACKOFF_MS` | بداية exponential backoff | Required | سياسة retry، الافتراضي `1000` | `instant` |
| `STAGING_JOB_TIMEOUT_MS` | مهلة Job | Required | سياسة Worker، الافتراضي `120000` | `no-timeout` |
| `STAGING_WORKER_SHUTDOWN_TIMEOUT_MS` | مهلة drain الهادئ | Conditional | سياسة إغلاق Worker، الافتراضي `30000` | `wait-forever` |
| `STAGING_WORKER_HARD_SHUTDOWN_TIMEOUT_MS` | deadline النهائي لـWorker | Conditional | يجب أن يكون أكبر من shutdown timeout، الافتراضي `60000` | `same-as-graceful` |
| `STAGING_WORKER_LOCK_DURATION_MS` | مدة lease/lock للـJob | Optional | سياسة الاستعادة، الافتراضي `30000` | `never-expires` |
| `STAGING_SCHEDULER_ENABLED` | تفعيل Scheduler | Required | قرار تشغيل واحد أو أكثر | `sometimes` |
| `STAGING_EMAIL_SCHEDULER_INTERVAL_MS` | فاصل دورة Scheduler | Optional | سياسة Scheduler، الافتراضي `1000` | `every-second-forever` |

أوقف استقبال Jobs جديدة قبل إغلاق Worker، وانتظر Jobs الجارية حتى `STAGING_WORKER_SHUTDOWN_TIMEOUT_MS`. إذا تجاوزت Job المهلة النهائية، لا تسجلها `completed`؛ اترك Outbox lease ينتهي لتتمكن Worker جديدة من استعادتها. يجب أن يكون hard deadline أكبر من graceful shutdown timeout.

### 3.11 Object Storage وAI

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_APP_STORAGE_BUCKET_ID` | bucket تخزين تطبيق Staging | Optional | Object Storage منفصل | `production-bucket` |
| `STAGING_REPLIT_OBJECT_STORAGE_BUCKET_ID` | bucket متوافق مع Replit إن استُخدم | Optional | إعداد Staging منفصل | `live-bucket` |
| `STAGING_GEMINI_API_KEY` | مفتاح Gemini، إن كانت ميزة AI مفعلة | Optional | Secret Manager من project مخصص | `not-a-key` |
| `STAGING_GEMINI_MODEL` | اسم نموذج AI | Optional | سياسة المنتج، الافتراضي موثق في المثال | `no-such-model` |

لا تضع مفاتيح AI في Git. إذا لم يكن التخزين أو AI مطلوبًا لا تفعله لمجرد إكمال الجدول.

### 3.12 Backup وRestore وبيانات الاختبار

| اسم المتغير | الوظيفة | Required / Optional | مصدر الحصول عليه | مثال وهمي غير صالح |
|---|---|---|---|---|
| `STAGING_BACKUP_DIR` | مسار نسخ Staging | Required | volume مشفر منفصل | `/production/backups` |
| `STAGING_BACKUP_RETENTION_DAYS` | مدة الاحتفاظ | Required | سياسة Beta، الافتراضي `7` | `forever` |
| `STAGING_BACKUP_SCHEDULE` | جدول cron المقترح | Optional | scheduler خارجي آمن | `not-cron` |
| `STAGING_RESTORE_VERIFY_DATABASE_URL` | قاعدة مؤقتة للتحقق من restore | Conditional | PostgreSQL مؤقتة منفصلة | `postgresql://production` |
| `STAGING_ALLOW_DATABASE_RESTORE` | حارس استعادة صريح | Conditional | لا يُحفظ؛ يُمرر للحظة التنفيذ فقط | `YES_WITHOUT_CHECKING` |
| `STAGING_BACKUP_STATUS` | حالة التحقق التشغيلي | Required for reporting | `not_configured` حتى تحقق فعلي | `passed-without-run` |
| `STAGING_TEST_DATA_ENABLED` | السماح ببيانات الاختبار | Required | قرار Beta | `maybe` |
| `STAGING_TEST_DATA_SEED` | seed فريد لبيانات الاختبار | Required | يُولد لكل بيئة/جولة | `short-seed` |
| `STAGING_TEST_USER_PREFIX` | prefix للمستخدمين التجريبيين | Optional | سياسة fixture | `production-user` |

ينبغي أن يكون مسار backup مشفرًا وغير مشترك مع Production. نفّذ restore في قاعدة تحقق مؤقتة أولًا، ولا تستخدم `--clean` على قاعدة متصلة بمستخدمين دون نافذة صيانة ومراجعة مستقلة.

## 4. إنشاء ملف البيئة والتحقق الصارم

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
# حرر الملف عبر Secret Manager أو محرر آمن فقط.
# لا تعرضه عبر cat في CI أو المحادثة.

pnpm run staging:validate
node scripts/validate-staging-env.mjs .env.staging --strict
docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet
```

يفشل `--strict` عند القيم الفارغة أو الضعيفة أو الافتراضية، وعند الإشارة إلى Production، أو عند CORS wildcard، أو عند عدم صحة URL/boolean/integer. عند تعطيل Gmail أو ClamAV أو FCM أو Web Push أو Billing، يجب إبقاء حالة كل تكامل `not_configured` صراحةً.

قبل تشغيل البيئة، افحص Git:

```bash
git status --short
pnpm run security:secrets
```

لا تستخدم ملف `.env.staging` في commit. يجب أن يكون secret scan نظيفًا.

## 5. إعداد الخدمات وتشغيل Docker Compose

### 5.1 PostgreSQL

تحقق من وجود PostgreSQL Staging منفصل أو دع Compose ينشئ `staging-postgres`. أنشئ مستخدمًا وقاعدة Staging بالقيم الموجودة في Secret Manager، ولا تنشر المنفذ إلى الإنترنت. يجب أن يطابق `STAGING_DATABASE_URL` المضيف والقاعدة نفسيهما.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d staging-postgres
docker compose --env-file .env.staging -f docker-compose.staging.yml ps staging-postgres
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-postgres \
  pg_isready -U "$STAGING_PGUSER" -d "$STAGING_PGDATABASE"
```

### 5.2 Redis

شغّل Redis مع كلمة مرور وvolume Staging منفصل. لا تجعل Redis public، ولا تشارك queue prefix مع Production.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d staging-redis
docker compose --env-file .env.staging -f docker-compose.staging.yml ps staging-redis
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-redis \
  sh -lc 'redis-cli -a "$STAGING_REDIS_PASSWORD" ping'
```

إذا كان Redis خارجيًا، نفّذ اختبار `PONG` عبر قناة إدارية آمنة ولا تطبع URI أو كلمة المرور.

### 5.3 SMTP وMailpit

الافتراضي هو `staging-smtp` عبر Mailpit، SMTP على 1025 وواجهة الفحص على 8025. لا ترسل إلى عناوين حقيقية. استخدم `STAGING_SMTP_FROM` من نطاق Staging.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d staging-smtp
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-smtp \
  wget -qO- http://127.0.0.1:8025/readyz
# UI المحلي عند الحاجة:
# http://127.0.0.1:8025
```

إذا استُخدم relay مخصص، اجعل الحساب والنطاق مخصصين لـStaging، واضبط connection/greeting/socket timeouts بما لا يتجاوز مهلة Job دون اختبار الإلغاء غير المثبت.

### 5.4 Gmail OAuth

اترك `STAGING_ENABLE_GMAIL=false` حتى تجهز Google Cloud project وOAuth client وPub/Sub service account مخصصة لـStaging. سجّل redirect URI الخاص بـStaging فقط، وخزّن client secret وtoken encryption key في Secret Manager. بعد ذلك فقط فعّل المتغيرات وشغّل validation والاختبارات المعزولة.

عند عدم الجاهزية:

```dotenv
STAGING_ENABLE_GMAIL=false
STAGING_GMAIL_PROVIDER_STATUS=not_configured
```

لا تستخدم بيانات Gmail الحقيقية أو OAuth client من Production.

### 5.5 ClamAV

وفّر خدمة ClamAV منفصلة إذا كان اختبار المرفقات مطلوبًا. اربطها بشبكة داخلية، واضبط `STAGING_CLAMAV_HOST` و`STAGING_CLAMAV_PORT` واختبر INSTREAM من API. عند عدم وجود الخدمة، لا تتجاوز الفحص؛ اترك `STAGING_ATTACHMENT_SCANNING_ENABLED=false` و`STAGING_CLAMAV_STATUS=not_configured`، وسيُرفض الرفع fail-closed.

### 5.6 FCM

أنشئ Firebase project مستقلًا لـStaging فقط، ثم خزّن project ID وtoken قصير العمر في Secret Manager. لا تضع service account JSON أو access token في Git. بدون ذلك:

```dotenv
STAGING_FCM_ENABLED=false
STAGING_FCM_STATUS=not_configured
```

استمر في اختبار دورة الإشعارات باستخدام Fake adapter، ولا تسمِّ ذلك نجاح FCM حقيقيًا.

### 5.7 Web Push

أنشئ VAPID key pair منفصلًا لـStaging، وخزّن private key في Secret Manager. اجعل public key متوافقًا مع Web Staging فقط. بدون ذلك:

```dotenv
STAGING_WEB_PUSH_ENABLED=false
STAGING_WEB_PUSH_STATUS=not_configured
```

### 5.8 Billing

اترك Billing معطلة أو استخدم Fake provider في اختبارات Staging. لا تربط webhook secret أو endpoint من Production. عند عدم توفير provider مخصص:

```dotenv
STAGING_ENABLE_BILLING=false
STAGING_BILLING_PROVIDER=fake
STAGING_BILLING_STATUS=not_configured
```

### 5.9 Caddy وHTTPS

أنشئ DNS منفصلًا يشير إلى حافة Staging، وتأكد أن `STAGING_ALLOWED_ORIGINS` يطابق Web origin صراحةً. ضع `STAGING_APP_DOMAIN` و`STAGING_ACME_EMAIL` في Secret Manager أو ملف غير متتبع، ولا تضع certificates أو private keys في Git.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml \
  --profile edge up -d staging-caddy

docker compose --env-file .env.staging -f docker-compose.staging.yml \
  --profile edge logs --no-color staging-caddy

curl --fail-with-body https://staging.example.invalid/api/health/live
curl --fail-with-body https://staging.example.invalid/api/health/ready
```

تأكد من security headers وHSTS وCORS، ومن أن API غير متاح مباشرة من الإنترنت. لا تستخدم `.invalid` في تشغيل عام؛ هو مثال آمن فقط.

### 5.10 تشغيل المجموعة

شغّل migrations قبل أو ضمن dependency chain ثم شغّل API وWorker وScheduler وWeb:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d \
  staging-postgres staging-redis staging-smtp staging-migrate staging-api \
  staging-worker staging-scheduler staging-web

docker compose --env-file .env.staging -f docker-compose.staging.yml ps
```

لا تشغّل `staging-caddy` إلا بعد جاهزية Web/API وDNS. لا تستخدم `down -v` إلا إذا كنت تقصد حذف قاعدة الاختبار وRedis data.

## 6. Migrations وhealth checks

### 6.1 Prisma validation/generate والمigrations

```bash
pnpm run db:validate
pnpm run db:generate

docker compose --env-file .env.staging -f docker-compose.staging.yml up staging-migrate

docker compose --env-file .env.staging -f docker-compose.staging.yml logs --no-log-prefix staging-migrate
```

ينبغي أن تنجح كل migrations من قاعدة فارغة. لا تستخدم `prisma db push` ولا تعدّل migration تاريخية. افحص حالة العملية قبل تشغيل API:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps staging-migrate
```

### 6.2 API وWeb وWorker وScheduler

```bash
curl --fail-with-body http://127.0.0.1:3500/api/health/live
curl --fail-with-body http://127.0.0.1:3500/api/health/ready
curl --fail http://127.0.0.1:3300/

docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-worker \
  test -f /tmp/zephyx-worker-ready
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-scheduler \
  test -f /tmp/zephyx-scheduler-ready
```

Readiness يجب أن يثبت اتصال PostgreSQL دون كشف أسرار أو تفاصيل اتصال. لا تعتبر API جاهزًا لمجرد أن العملية بدأت؛ افحص `/api/health/ready` وmarkers الخاصة بالـWorker والـScheduler.

### 6.3 أوامر start/stop مستقلة

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop staging-worker staging-scheduler
docker compose --env-file .env.staging -f docker-compose.staging.yml start staging-worker staging-scheduler

docker compose --env-file .env.staging -f docker-compose.staging.yml logs --no-color \
  staging-api staging-worker staging-scheduler
```

## 7. بيانات الاختبار واختبار Beta

أنشئ fixtures آمنة فقط من داخل Staging. السكربت يولد مستخدمين بعناوين `example.invalid` ولا يقرأ Production:

```bash
STAGING_BASE_URL=http://127.0.0.1:3500 node scripts/staging-seed.mjs
```

بعد جاهزية الخدمات نفّذ:

```bash
STAGING_BASE_URL=http://127.0.0.1:3500 \
STAGING_WEB_URL=http://127.0.0.1:3300 \
node scripts/staging-smoke.mjs

pnpm run staging:smoke
pnpm run load:test
```

يجب أن يغطي Beta acceptance ما يلي: liveness وreadiness؛ التسجيل والدخول وتجديد الجلسة؛ Inbox والمجلدات والبحث؛ إنشاء Draft وتعديله وإرساله عبر Mailpit؛ Redis realtime وone-time ticket؛ Worker وScheduler markers؛ notification lifecycle عبر Fake adapter؛ وbackup/restore verification.

يجب تسجيل كل adapter خارجي كـ`configured` أو `not_configured`. لا تعتبر Gmail OAuth أو ClamAV أو FCM أو Web Push أو Billing ناجحة دون خدمة وcredentials مخصصة. إذا كان ClamAV غير مهيأ، سجّل attachment upload/download كـ`NOT_CONFIGURED` ولا تتجاوز fail-closed.

## 8. Backup وRestore

### 8.1 Backup يدوي

اضبط `STAGING_BACKUP_DIR` على volume مشفر منفصل، ثم نفّذ النسخ من مضيف يملك أدوات PostgreSQL:

```bash
mkdir -p "$STAGING_BACKUP_DIR"
chmod 700 "$STAGING_BACKUP_DIR"

DATABASE_URL="$STAGING_DATABASE_URL" \
BACKUP_DIR="$STAGING_BACKUP_DIR" \
BACKUP_RETENTION_DAYS="${STAGING_BACKUP_RETENTION_DAYS:-7}" \
./scripts/backup-postgres.sh
```

السكربت ينشئ dump بصيغة custom وملف checksum ملازمًا له. لا تطبع `DATABASE_URL` ولا تحفظها في shell history.

### 8.2 تحقق checksum وRestore في قاعدة مؤقتة

استخدم قاعدة تحقق جديدة ومعزولة، لا قاعدة Staging العاملة ولا Production:

```bash
sha256sum --check /secure/staging-backups/<dump-file>.sha256

DATABASE_URL="<isolated-verification-database-url>" \
BACKUP_FILE="/secure/staging-backups/<dump-file>" \
VERIFY_TABLE="<safe-table-name>" \
VERIFY_QUERY="<safe-read-only-marker-query>" \
./scripts/verify-backup-restore.sh
```

يطلب السكربت داخليًا قيمة الحارس `YES_I_HAVE_VERIFIED_THE_TARGET` ويقارن marker قبل وبعد restore. لا تستبدل placeholders بأسرار في Git أو المحادثة، ولا تستخدم `--clean` على قاعدة بها مستخدمون دون موافقة وإجراء صيانة معتمد.

بعد التحقق، وثّق checksum ووقت النسخة وCommit الإصدار والبيئة المستهدفة في سجل تشغيلي لا يحتوي credentials. احذف نسخ Staging القديمة وفق retention، ولا تخلط حزمًا من snapshots مختلفة.

## 9. Runbook للحوادث التشغيلية

### 9.1 توقف Worker

أولًا افحص الحالة والسجلات دون طباعة متغيرات البيئة:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps staging-worker
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=200 --no-color staging-worker
```

إذا كان السبب قابلًا للإصلاح، أوقف Worker ثم شغّلها مجددًا. لا تسجل Job أو Outbox row كـ`completed` يدويًا. اترك lease ينتهي، ثم راقب أن Worker الجديدة تستعيد الصف مرة واحدة. تحقق من أن `STAGING_WORKER_HARD_SHUTDOWN_TIMEOUT_MS` أكبر من graceful timeout وأن العملية لا تعلق إلى أجل غير محدد.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml restart staging-worker
# بعد lease recovery:
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=200 --no-color staging-worker
```

إذا تكرر التوقف، جمّد تشغيل Beta، احفظ correlation IDs المنقاة فقط، وافحص Redis/PostgreSQL وSMTP قبل إعادة المحاولة.

### 9.2 امتلاء Redis أو queue lag

لا تحذف Redis data عشوائيًا. افحص الذاكرة والـkeys من قناة إدارية آمنة، وتحقق من عدم استخدام Production prefix:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T staging-redis \
  sh -lc 'redis-cli -a "$STAGING_REDIS_PASSWORD" INFO memory'
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=200 --no-color \
  staging-worker staging-scheduler
```

أوقف المنتج أو الحمل الاختباري إذا اقتربت الذاكرة من الحد، ثم قلل fixtures المؤقتة، راجع retention، وتحقق من Dead-letter والـretry backlog. لا تشغّل `docker compose down -v` إلا بعد موافقة مالك Staging لأنه يحذف volume.

### 9.3 فشل SMTP

تحقق من Mailpit أو relay، ومن healthcheck والمهلات، دون إرسال رسالة إلى عنوان حقيقي:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps staging-smtp
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=200 --no-color staging-smtp
curl --fail-with-body http://127.0.0.1:8025/readyz
```

راجع `STAGING_SMTP_CONNECTION_TIMEOUT_MS` و`STAGING_SMTP_GREETING_TIMEOUT_MS` و`STAGING_SMTP_SOCKET_TIMEOUT_MS` مقابل `STAGING_JOB_TIMEOUT_MS`. إذا انقطع الاتصال بعد احتمال قبول الرسالة، تعامل مع النتيجة كـ`delivery_unknown` ولا تطلق retry تلقائيًا قد يكرر الإرسال. لا تدّعِ إلغاء Nodemailer بواسطة `AbortSignal`.

### 9.4 فشل ClamAV

اعتبر فشل ClamAV فشلًا آمنًا من ناحية الرفع: اترك الرفع مرفوضًا، ولا تستخدم scanner وهميًا في Staging الحقيقي. افحص اتصال الخدمة والسجلات وشغّل smoke test بعد إصلاح الشبكة أو الخدمة:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
# إذا كانت خدمة ClamAV خارج Compose، اختبرها من شبكة API بقناة إدارية آمنة.
```

إذا لم تكن الخدمة متوفرة أصلًا، لا تغيّر `STAGING_ATTACHMENT_SCANNING_ENABLED` إلى `true`، وسجّل التكامل `NOT_CONFIGURED`. بعد توفير ClamAV، حدّث القيم في Secret Manager، نفّذ `--strict`، ثم أعد اختبار fixture آمن صغيرًا مع التحقق من Magic Bytes وlimits وfilename sanitization.

### 9.5 استعادة قاعدة البيانات

أوقف API وWorker وScheduler قبل أي استعادة موجهة إلى قاعدة Staging، وخذ snapshot إضافية. افحص dump وchecksum واستعد أولًا إلى قاعدة مؤقتة. لا تستعد إلى Production ولا تستخدم هدفًا غير متحقق منه.

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop \
  staging-api staging-worker staging-scheduler

DATABASE_URL="<isolated-verification-database-url>" \
BACKUP_FILE="/secure/staging-backups/<dump-file>" \
ALLOW_DATABASE_RESTORE=YES_I_HAVE_VERIFIED_THE_TARGET \
./scripts/restore-postgres.sh
```

شغّل `verify-backup-restore.sh` قبل اعتماد النتيجة، ثم افحص schema وhealth وmigrations قبل إعادة الخدمات. إذا كان الاسترجاع جزءًا من rollback، قارِن Commit وmigration والبيانات، ولا تعكس migration تلقائيًا. بعد النجاح:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d \
  staging-migrate staging-api staging-worker staging-scheduler staging-web
curl --fail-with-body http://127.0.0.1:3500/api/health/ready
```

## 10. Checklist قبل إعلان Beta

- [ ] الإصدار المثبت هو `v0.7.0-staging-ready` ومرجعه لا يساوي Production.
- [ ] الخادم وPostgreSQL وRedis وSMTP وObject Storage وDNS معزولة عن Production.
- [ ] `.env.staging` غير متتبع وصلاحياته `0600`، و`pnpm run security:secrets` ناجح.
- [ ] `node scripts/validate-staging-env.mjs .env.staging --strict` ناجح.
- [ ] `docker compose ... config --quiet` ناجح.
- [ ] كل migrations طبقت بنجاح من قاعدة Staging صحيحة.
- [ ] API live وready، وWeb يرد، وWorker/Scheduler markers موجودة.
- [ ] التسجيل والدخول وتجديد الجلسة وDraft/send عبر Mailpit نجحت.
- [ ] Inbox/search/folders وRedis realtime وone-time ticket نجحت.
- [ ] notification lifecycle اختُبرت عبر Fake adapter دون ادعاء نجاح FCM/Web Push.
- [ ] attachment fixture اختُبرت فقط إذا كان ClamAV مهيأ؛ وإلا فهي `NOT_CONFIGURED` وfail-closed.
- [ ] backup وchecksum وrestore إلى قاعدة مؤقتة تم التحقق منها.
- [ ] Gmail OAuth وClamAV وFCM وWeb Push وBilling حالاتُها موثقة كـ`configured` أو `NOT_CONFIGURED`.
- [ ] لا توجد بيانات مستخدمين حقيقية أو أسرار أو endpoints Production في البيئة.

## 11. أوامر إيقاف وتشغيل وتنظيف

إيقاف الخدمات مع الإبقاء على volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop
```

حذف الحاويات مع الإبقاء على volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

حذف volumes وقاعدة الاختبار وRedis data **فقط بعد موافقة مالك Staging**:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down -v
```

بعد أي إعادة تشغيل، أعد validation وhealth checks وsmoke tests ولا تعتبر عملية Docker `running` وحدها دليل جاهزية.

## 12. مراجع المستودع

تعتمد هذه الوثيقة على ملفات الإصدار نفسها، لا على أسرار أو إعدادات خارجية غير موثقة:

1. [`.env.staging.example`](./.env.staging.example) — قالب المتغيرات وقيم الإعداد الافتراضية الآمنة.
2. [`docker-compose.staging.yml`](./docker-compose.staging.yml) — الخدمات والشبكات والـhealthchecks.
3. [`docs/staging-deployment-runbook.md`](./docs/staging-deployment-runbook.md) — runbook الإصدار v7 الأساسي.
4. [`scripts/validate-staging-env.mjs`](./scripts/validate-staging-env.mjs) — قواعد التحقق الصارم ومنع Production references.
5. [`scripts/staging-smoke.mjs`](./scripts/staging-smoke.mjs) — اختبارات Staging و`NOT_CONFIGURED`.
6. [`scripts/staging-seed.mjs`](./scripts/staging-seed.mjs) — بيانات الاختبار الآمنة المولدة وقت التشغيل.
7. [`deploy/Caddyfile.staging`](./deploy/Caddyfile.staging) — reverse proxy وHTTPS headers.
8. [`scripts/backup-postgres.sh`](./scripts/backup-postgres.sh) و[`scripts/verify-backup-restore.sh`](./scripts/verify-backup-restore.sh) و[`scripts/restore-postgres.sh`](./scripts/restore-postgres.sh) — backup/checksum/restore guards.

**حالة الوثيقة:** جاهزة للمراجعة التشغيلية. لا تتضمن أي credentials، ولا تنفذ إعداد خدمات خارجية. تتوقف الخطوة التالية على توفير الخدمات والـcredentials المخصصة لـStaging خارج GitHub، وليس داخل هذه المحادثة.
