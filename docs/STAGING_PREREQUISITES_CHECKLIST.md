# Zephyx Mail — Staging Prerequisites Closure Checklist

**تاريخ التحقق:** 27 أغسطس 2026
**المستودع:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`
**الفرع:** `archive-source-work`
**HEAD المتوقع والمتحقق:** `0826683c54d943c00f117b8c05563b8bb9bb872a`
**Commit / Push:** NO / NO
**نطاق الوثيقة:** إغلاق متطلبات ما قبل التفعيل فقط؛ لا تغييرات في منطق التطبيق أو Compose، ولا إنشاء credentials أو اتصال بمزود خارجي.

## الحكم التنفيذي

المصدر الرسمي وملف قالب Staging وأدوات Docker متاحة محليًا. قالب `.env.staging.example` مرّ عبر `pnpm run staging:validate` في schema/example mode. لكن لا توجد حاليًا بيئة Staging مستقلة أو ملف Secret Store خارجي بصلاحية `0600` أو connectors مخصصة لمزودي AI وURL Intelligence وAttachment Sandbox. لذلك لا يمكن اعتبار الخدمات أو التفعيل التشغيلي جاهزًا، ولا يجوز تشغيل Compose بالقالب وحده أو اختراع نتائج provider.

> وجود binary أو تعريف خدمة داخل Compose لا يساوي جاهزية تشغيلية. في هذا التقرير تعني `READY` أن primitive أو أداة التحقق متاحة، وتعني `NOT_CONFIGURED` أن الإعداد الآمن أو الاعتماد أو endpoint غير موجود، وتعني `BLOCKED` أن التحقق التشغيلي يتطلب مضيفًا أو SDK أو شرطًا خارجيًا غير متوفر.

## مسار Staging الموصى به

المسار الأفضل للمشروع هو **Staging مستقل كامل** لا يشارك Production في المضيف أو قاعدة البيانات أو Redis أو object bucket أو مفاتيح التشفير أو DNS credentials. يُنشر على مضيف أو VM مستقل باسم خدمة منطقي مثل `zephyx-staging-host`، ويُستخدم له نطاق فرعي فعلي مثل `staging.<DOMAIN>` يشير عبر DNS إلى عنوان المضيف. يكون Caddy هو نقطة الدخول الوحيدة العامة، وينهي TLS عبر ACME، ويمرر الطلبات إلى API/Web داخليين مع trusted proxy وCORS allowlist صريحين.

داخل المضيف يُفضّل فصل الخدمات إلى PostgreSQL وRedis وMinIO/S3 وClamAV وSMTP sink، مع API وWorker وScheduler كخدمات منفصلة. يستخدم كل مكوّن namespace وcredentials خاصة بـStaging. لا يجب نشر PostgreSQL أو Redis أو MinIO أو ClamAV مباشرة للعامة؛ تُفتح فقط المنافذ اللازمة بين الخدمات وCaddy، وتُحصر لوحة Mailpit وواجهات الإدارة في شبكة إدارية أو allowlist.

| طبقة المسار | الإعداد الموصى به | حالة الجاهزية الحالية |
|---|---|---|
| Host/VM | `zephyx-staging-host` مستقل مع backups وfirewall وresource monitoring | **BLOCKED**؛ لا يوجد مضيف مستقل متاح |
| DNS | `staging.<DOMAIN>` وA/AAAA record إلى المضيف | **NOT_CONFIGURED**؛ لا يوجد domain/zone فعلي |
| Edge | Caddy 2.9+، HTTP→HTTPS، ACME renewal، security headers وtrusted proxy | **BLOCKED**؛ Caddy 2.6.2 مثبت فقط، ولا يوجد Caddyfile أو DNS/ACME |
| Secret Store | مزود Secret Store أو ملف `/secure/.../staging.env` بصلاحية `0600` خارج Git | **NOT_CONFIGURED**؛ لا يوجد ملف أو connector مخصص |
| Data plane | PostgreSQL وRedis منفصلان بقاعدة/namespace وroles خاصة بـStaging | **NOT_CONFIGURED**؛ تعريفات Compose فقط |
| Mail security | ClamAV حقيقي عبر INSTREAM وMinIO/S3 خاص وSMTP sink Staging | **NOT_CONFIGURED** تشغيليًا في هذه الجولة؛ لا daemons مفعلة |
| Application plane | API وWorker وScheduler منفصلة مع readiness وmetrics وqueue alerts | **NOT_CONFIGURED**؛ لا deployment مفعّل |
| Monitoring | metrics/logs/traces/uptime وalerts لـAPI/DB/Redis/queue/ClamAV/S3 | **NOT_CONFIGURED**؛ لا endpoint أو project مفعّل |
| Client verification | Flutter/Dart مثبتان على runner أو CI منفصل | **BLOCKED**؛ SDK غير مثبت |
| Optional providers | AI وURL Intelligence وAttachment Sandbox عبر Secret Store وبـconsent | **NOT_CONFIGURED**؛ لا credentials أو endpoints حقيقية |

## حالة المتطلبات

| المتطلب | الحالة | الموجود حاليًا | الناقص أو سبب التصنيف |
|---|---|---|---|
| المستودع والفرع والـHEAD | **READY** | remote والفرع والـHEAD مطابقون | لا يوجد نقص في نطاق هذه المرحلة |
| Secret Store أو ملف خارجي `0600` | **NOT_CONFIGURED** | لا يوجد ملف في `/etc/zephyx/staging.env` أو `~/.config/zephyx/staging.env` أو `/run/secrets/zephyx-staging.env`، ولا يوجد connector مخصص | يلزم Secret Store أو ملف يملكه المستخدم بصلاحية `0600`، مع عدم طباعته أو وضعه في Git |
| Staging host مستقل | **BLOCKED** | لا يوجد مضيف Staging منفصل متاح لهذه الجولة | يلزم VM/host مستقل، namespace وnetwork وstorage وDNS منفصلة عن التطوير |
| PostgreSQL Staging | **NOT_CONFIGURED** | تعريف Compose ومتغيرات البيئة موجودة | لا توجد instance Staging مفعلة حاليًا أو credentials في Secret Store؛ يلزم قاعدة وrole وbackup policy منفصلة |
| Redis Staging | **NOT_CONFIGURED** | تعريف Compose وqueue/realtime variables موجودة | لا توجد instance أو password/URL مفعلة؛ يلزم namespace/queue prefix وTLS policy عند الحاجة |
| API Staging | **NOT_CONFIGURED** | build وhealth routes موجودة | لا توجد عملية أو deployment Staging دائم؛ يلزم URL وruntime env وreadiness probe |
| Worker | **NOT_CONFIGURED** | تعريف service وqueue variables موجود | لا يوجد worker Staging مفعّل؛ يلزم service منفصل، concurrency وshutdown policy وfailure monitoring |
| Scheduler | **NOT_CONFIGURED** | scheduler flag وreservation variables موجودة | لا توجد عملية Scheduler مفعلة؛ يلزم instance واحدة أو leader/lease policy واضحة |
| ClamAV daemon | **NOT_CONFIGURED** | متغيرات `CLAMAV_*` والسياسة fail-closed موجودة | لا يوجد daemon Staging حي في هذه الجولة؛ يلزم daemon حقيقي قابل للوصول عبر INSTREAM، مع رفض الرفع عند عدم التوفر |
| MinIO/S3 Object Storage | **NOT_CONFIGURED** | abstraction و`S3_*` variables وCompose service موجودة | لا يوجد bucket/credentials Staging مفعّلة في Secret Store؛ يلزم bucket مع environment/org/user object paths وlifecycle/backup policy |
| SMTP Staging | **NOT_CONFIGURED** | أسماء SMTP وMailpit الاختباري موجودة في القالب | لا يوجد SMTP relay أو sink مفعّل في هذه الجولة؛ يلزم Mailpit/SMTP Staging مع sender وegress policy |
| DNS | **NOT_CONFIGURED** | أسماء domain/origin موجودة في القالب | لا يوجد domain أو zone أو DNS records قابلة للتحقق، وأداة DNS CLI غير مثبتة |
| TLS/ACME/Caddy | **NOT_CONFIGURED** | Caddy binary مثبت، وTLS mode/port variables موجودة | لا يوجد Caddyfile/edge deployment أو domain/ACME challenge؛ يلزم شهادة وDNS وegress وrenewal monitoring |
| Public Monitoring | **NOT_CONFIGURED** | logging/metrics variables موجودة في القالب والكود | لا يوجد monitoring project/endpoint/alerting خارجي مفعّل؛ يلزم metrics, logs, traces, uptime وqueue/DB alerts |
| Flutter/Dart SDK | **BLOCKED** | مسار `mobile/novamail-flutter` موجود | `flutter` و`dart` غير مثبتين؛ يلزم SDK ثم `flutter pub get`, `flutter analyze`, `flutter test` مباشرة من المشروع |
| AI Provider | **NOT_CONFIGURED** | عقد ThreatAnalysisProvider وأسماء `THREAT_ANALYSIS_*` موجودة | لا يوجد provider/endpoint/key حقيقي؛ يلزم Secret Store وconsent وredaction وtimeouts وcost limits قبل التفعيل |
| URL Intelligence Provider | **NOT_CONFIGURED** | أسماء `URL_INTELLIGENCE_*` والحواجز موجودة | لا يوجد endpoint/key حقيقي؛ يلزم provider لفحص reputation/age/TLS/redirect/lookalike دون اختلاق facts |
| Attachment Sandbox | **NOT_CONFIGURED** | واجهة sandbox و`ATTACHMENT_SANDBOX_*` موجودة | لا يوجد sandbox حقيقي؛ يلزم staging-only endpoint، ولا يجوز أن يتجاوز ClamAV أو fail-closed |

## أسماء متغيرات البيئة المطلوبة

الأسماء أدناه مستخرجة من قالب Staging والكود فقط. لا تمثل القيم، ولم تُقرأ أو تُطبع أي قيمة سرية.

### AI Provider وSecurity Engine

الأسماء الأساسية هي `THREAT_ANALYSIS_PROVIDER` و`THREAT_ANALYSIS_API_URL` و`THREAT_ANALYSIS_API_KEY` و`THREAT_ANALYSIS_MODEL` و`THREAT_ANALYSIS_TIMEOUT_MS` و`THREAT_ANALYSIS_MAX_RETRIES` و`THREAT_ANALYSIS_RATE_LIMIT_PER_MINUTE` و`THREAT_ANALYSIS_MAX_INPUT_TOKENS_PER_DAY` و`THREAT_ANALYSIS_ASSISTANT_RATE_LIMIT_PER_MINUTE`. في طبقة Staging تظهر أيضًا `STAGING_GEMINI_API_KEY` و`STAGING_GEMINI_MODEL`، لكن وجود الاسم لا يعني تفعيل Gemini أو أي مزود.

### URL Intelligence

الأسماء هي `URL_INTELLIGENCE_PROVIDER` و`URL_INTELLIGENCE_API_URL` و`URL_INTELLIGENCE_API_KEY` و`URL_INTELLIGENCE_TIMEOUT_MS`. يبقى الفحص المحلي متاحًا دون أن يُنسب domain age أو reputation أو TLS أو redirects إلى مزود غير مهيأ.

### Attachment Sandbox وClamAV

للـsandbox: `ATTACHMENT_SANDBOX_PROVIDER` و`ATTACHMENT_SANDBOX_API_URL` و`ATTACHMENT_SANDBOX_API_KEY` و`ATTACHMENT_SANDBOX_ENVIRONMENT` و`ATTACHMENT_SANDBOX_TIMEOUT_MS`. لـClamAV: `ATTACHMENT_SCANNING_ENABLED` و`CLAMAV_HOST` و`CLAMAV_PORT` و`CLAMAV_SOCKET`، وفي ملف Staging المقابل `STAGING_ATTACHMENT_SCANNING_ENABLED` و`STAGING_CLAMAV_HOST` و`STAGING_CLAMAV_PORT` و`STAGING_CLAMAV_STATUS`.

### SMTP وMailpit

الأسماء runtime هي `SMTP_HOST` و`SMTP_PORT` و`SMTP_FROM`. ويشمل قالب Staging `STAGING_SMTP_HOST` و`STAGING_SMTP_PORT` و`STAGING_SMTP_FROM` و`STAGING_SMTP_USER` و`STAGING_SMTP_PASS` و`STAGING_SMTP_SECURE` و`STAGING_SMTP_CONNECTION_TIMEOUT_MS` و`STAGING_SMTP_GREETING_TIMEOUT_MS` و`STAGING_SMTP_SOCKET_TIMEOUT_MS` و`STAGING_TEST_SMTP_UI_URL`.

### PostgreSQL

الأسماء هي `DATABASE_URL` و`STAGING_DATABASE_URL` و`STAGING_PGHOST` و`STAGING_PGPORT` و`STAGING_PGUSER` و`STAGING_PGPASSWORD` و`STAGING_PGDATABASE` و`STAGING_PGSSLMODE` و`STAGING_RESTORE_VERIFY_DATABASE_URL`.

### Redis وBullMQ

الأسماء هي `REDIS_URL` و`STAGING_REDIS_URL` و`STAGING_REDIS_HOST` و`STAGING_REDIS_PORT` و`STAGING_REDIS_PASSWORD` و`STAGING_REDIS_TLS` و`STAGING_QUEUE_PREFIX` و`STAGING_RATE_LIMIT_REDIS_PREFIX` و`STAGING_QUEUE_MAX_ATTEMPTS` و`STAGING_QUEUE_BACKOFF_MS`.

### MinIO/S3

الأسماء هي `S3_ENDPOINT` و`S3_REGION` و`S3_BUCKET` و`S3_ACCESS_KEY` و`S3_SECRET_KEY` و`S3_FORCE_PATH_STYLE`. توجد أيضًا `STAGING_REPLIT_OBJECT_STORAGE_BUCKET_ID` و`APP_STORAGE_BUCKET_ID` في القالب/الكود، لكن لا يجوز استخدامها بدل إعداد S3/MinIO الصريح المطلوب.

### OAuth وGmail/Outlook

الأسماء هي `STAGING_ENABLE_GMAIL` و`STAGING_GMAIL_PROVIDER_STATUS` و`STAGING_GOOGLE_CLIENT_ID` و`STAGING_GOOGLE_CLIENT_SECRET` و`STAGING_GOOGLE_REDIRECT_URI` و`STAGING_GMAIL_TOKEN_ENCRYPTION_KEY` و`STAGING_GMAIL_PUBSUB_OIDC_AUDIENCE` و`STAGING_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`. تظهر runtime names المقابلة مثل `GMAIL_CLIENT_ID` و`GMAIL_CLIENT_SECRET` و`GOOGLE_REDIRECT_URI`، ولا توجد إعدادات Outlook فعلية في هذه الجولة.

### DNS/TLS/Proxy

الأسماء هي `STAGING_APP_DOMAIN` و`STAGING_APP_BASE_URL` و`STAGING_WEB_URL` و`STAGING_ALLOWED_ORIGINS` و`STAGING_TLS_MODE` و`STAGING_TRUST_PROXY` و`STAGING_CADDY_HTTP_PORT` و`STAGING_CADDY_HTTPS_PORT` و`STAGING_COOKIE_SECURE` و`STAGING_COOKIE_SAME_SITE`.

### Monitoring وRuntime Observability

الأسماء الموجودة هي `STAGING_LOG_LEVEL` و`LOG_LEVEL` و`STAGING_REQUEST_BODY_LIMIT_BYTES` و`STAGING_SSE_ENABLED` و`STAGING_SSE_HEARTBEAT_MS` و`STAGING_SSE_MAX_CONNECTIONS_PER_USER` و`STAGING_SSE_REPLAY_LIMIT` و`STAGING_WORKER_LOCK_DURATION_MS` و`STAGING_WORKER_SHUTDOWN_TIMEOUT_MS` و`STAGING_WORKER_HARD_SHUTDOWN_TIMEOUT_MS` و`STAGING_JOB_TIMEOUT_MS` و`STAGING_EMAIL_SCHEDULER_INTERVAL_MS`. لا يوجد endpoint monitoring عام أو credentials له.

## أسماء الحسابات والخدمات المطلوبة دون أسرار

| الغرض | الاسم المنطقي المطلوب |
|---|---|
| PostgreSQL | قاعدة `zephyx_staging` وrole مخصص للتطبيق، مع role منفصل للـbackup/restore عند الحاجة |
| Redis | instance/namespace `zephyx-staging` وqueue prefix غير مشترك مع Production |
| API | deployment `zephyx-api-staging` مع readiness/liveness وruntime service account |
| Worker | deployment `zephyx-worker-staging` مع queue prefix وfailure alerts |
| Scheduler | deployment `zephyx-scheduler-staging` مع lease/leader policy |
| ClamAV | daemon `zephyx-clamav-staging` أو خدمة managed equivalent تدعم INSTREAM |
| MinIO/S3 | bucket `zephyx-staging`، access policy محدودة، وnamespace object paths للبيئة والمؤسسة والمستخدم والمرفق |
| SMTP | sink `zephyx-mailpit-staging` أو relay Staging مع egress محدود |
| Edge | Caddy deployment `zephyx-caddy-staging` وDNS name مخصص لـStaging |
| Monitoring | project/tenant `zephyx-staging-monitoring` مع alerts للـAPI وDB وRedis وqueue وClamAV وS3 |
| AI/URL/Sandbox | projects أو tenants Staging منفصلة لدى مزودين معتمدين، تُحقن credentials عبر Secret Store فقط |

## أوامر تحقق آمنة

لا تستخدم `cat` أو `source` لملف الأسرار، ولا تضع secret في command line أو logs.

```bash
# مصدر وGit
git remote get-url origin
git branch --show-current
git rev-parse HEAD
git status --short
git reflog --all --format='%gs' -n 200 | grep -iE 'reset|main' || true

# قالب البيئة والملف الخارجي؛ الملف الخارجي يجب أن يكون 0600
node scripts/validate-staging-env.mjs .env.staging.example
node scripts/validate-staging-env.mjs /secure/path/staging.env --strict
stat -c '%a %n' /secure/path/staging.env

# Compose دون عرض resolved environment
sudo docker compose --env-file /secure/path/staging.env -f docker-compose.staging.yml config --quiet

# الأدوات
sudo docker info --format '{{.ServerVersion}}'
docker compose version
caddy version
flutter --version
dart --version

# DNS/TLS بعد توفير domain وCaddyfile خارج Git
dig +short staging.example.invalid
caddy validate --config /secure/path/Caddyfile

# Readiness بعد نشر API على Staging فقط
curl --fail --silent --show-error https://staging.example.invalid/api/health/ready >/dev/null
```

الأمر الآمن لاختبار Secret Store هو فحص وجود metadata والصلاحيات فقط، مثل `stat` وواجهة Secret Store المعتمدة، دون طباعة payload أو تمريره في URL أو argument. يجب تشغيل provider health-check من داخل بيئة Staging بعد الموافقة والإعداد، وتسجيل status/latency فقط دون body أو token.

## ترتيب الإعداد الصحيح

1. إنشاء Staging host وnetwork وnamespace منفصلة، وتثبيت سياسة عدم استخدام Production data.
2. إنشاء Secret Store أو ملف خارجي مملوك للمشغل بصلاحية `0600`، ثم إضافة قيم Staging فقط دون طباعتها.
3. إعداد PostgreSQL وRedis مع users/databases/prefixes منفصلة، ثم تطبيق migrations والتحقق من backup/restore.
4. إعداد MinIO/S3 bucket والسياسات والمفاتيح المعزولة، ثم التحقق من object key namespace وownership.
5. إعداد ClamAV الحقيقي عبر INSTREAM، واختبار clean وEICAR وscanner unavailable؛ يبقى الرفع والتخزين والإرسال مرفوضًا عند unavailable.
6. إعداد Mailpit أو SMTP Staging sink مع sender وegress policy، ومنع external relay غير المقصود.
7. نشر API ثم Worker ثم Scheduler، وربط readiness/liveness والـqueue/retry/idempotency والـgraceful shutdown.
8. إعداد Caddy وDNS وTLS/ACME وtrusted proxy وCORS، ثم تفعيل monitoring والإنذارات.
9. تفعيل AI أو URL Intelligence أو Attachment Sandbox فقط بعد توفير credentials حقيقية، consent، redaction، DPA/retention، rate/cost limits واختبار Staging موثق. لا تُرسل المرفقات إلى AI.
10. تثبيت Flutter/Dart ثم تشغيل التحقق مباشرة من `mobile/novamail-flutter`.
11. تشغيل provider smoke وhealth/readiness وstaging smoke وbackup/restore وattachment flow وtenant isolation وsecurity/privacy tests، ثم تنظيف بيانات الاختبار.

## شروط الانتقال إلى Real Staging Activation

لا ينتقل المشروع إلى Activation حقيقي حتى تتحقق الشروط التالية معًا: ملف Secret Store خارجي بصلاحية صحيحة؛ Staging host مستقل؛ PostgreSQL وRedis وAPI وWorker وScheduler وClamAV وMinIO/S3 وSMTP تعمل داخل topology المقصودة؛ readiness وbackup/restore ناجحان؛ DNS وTLS/ACME وCaddy صالحون؛ monitoring والإنذارات متصلة؛ Flutter/Dart يمران مباشرة من المشروع؛ وprovider credentials موثقة في Secret Store مع consent وredaction واختبار failure paths.

بالنسبة لـAI، لا يكفي وجود مفتاح؛ يجب إثبات عدم إرسال المرفقات، organization consent، حدود التكلفة والمعدل، timeout/retry/circuit breaker، وعدم جعل AI قرار الحظر الوحيد. بالنسبة لـURL Intelligence، يجب إثبات structured findings للـreputation وdomain age وTLS وredirects وlookalike فقط عند توفر المصدر الحقيقي. بالنسبة للـAttachment Sandbox، يجب أن تكون Staging-only ولا تتجاوز ClamAV fail-closed.

## التصنيف النهائي

| التصنيف | العناصر |
|---|---|
| **READY** | المصدر الرسمي، branch/HEAD، قالب البيئة، `pnpm run staging:validate` في example mode، Docker Engine، Docker Compose v2، Caddy binary، تعريفات Compose وenvironment names |
| **NOT_CONFIGURED** | Secret Store، PostgreSQL/Redis/API/Worker/Scheduler runtime، ClamAV daemon runtime، MinIO/S3 bucket runtime، SMTP Staging، DNS، TLS/ACME/Caddy deployment، Public Monitoring، AI Provider، URL Intelligence Provider، Attachment Sandbox، OAuth providers |
| **BLOCKED** | Staging host المستقل، Flutter/Dart SDK، strict validation، Compose startup وreadiness وprovider smoke وReal Staging Activation لغياب Secret Store والبيئة التشغيلية |
| **FAILED** | لا يوجد فشل تطبيق مثبت في هذه المرحلة؛ لم تُخفَ نتيجة باستخدام Fake Provider أو Fake Scanner ولم يُجرَ اتصال خارجي |

## حالة Git والتنظيف

لم يُنفذ Commit أو Push أو Reset، ولم يُستخدم ZIP بديل، ولم يتغير `main` أو PR #8. التغيير التوثيقي الوحيد في هذه المرحلة هو هذا الملف. تبقى تغييرات Security Engine والملفات المولدة والتقارير السابقة غير ملتزمة كما كانت قبل بدء المرحلة، ولم تُعدّل ملفات Compose أو منطق التطبيق.

## المراجع

[1]: ../scripts/validate-staging-env.mjs "Strict Staging environment validator"
[2]: ../docker-compose.staging.yml "Staging Compose topology"
[3]: ../artifacts/api-server/src/lib/production-config.ts "Production provider validation"
[4]: ../artifacts/api-server/src/lib/attachment-security.ts "ClamAV INSTREAM and fail-closed policy"
[5]: ../artifacts/api-server/src/lib/attachment-storage.ts "S3-compatible Object Storage abstraction"
[6]: https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip/tree/archive-source-work "Official repository branch"
