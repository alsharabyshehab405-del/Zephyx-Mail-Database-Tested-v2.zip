# خطة تشغيل Backend Staging عبر HTTPS — Zephyx Mail

## 1. حالة الخطة ونطاقها

هذه الوثيقة **خطة تشغيل فقط**. لم يتم تشغيل Backend Staging، ولم يتم إنشاء حساب، ولم يتم بناء APK بعنوان Staging، لأن عنوان HTTPS الحقيقي وبنية Staging المستقلة غير متوفرين حاليًا.

| البند | القيمة الحالية |
|---|---|
| المستودع | `/home/ubuntu/zephyx-mail-github-official-archive-source-work` |
| الفرع | `archive-source-work` |
| HEAD | `4f0e82f2740638370794f42bbb64caad19733497` |
| عنوان Flutter الافتراضي الحالي | `http://10.0.2.2:5000/api` |
| عنوان Staging HTTPS | غير متوفر — `BLOCKED` |
| API وPostgreSQL وRedis خلف خادم Staging | لم تُفعّل بعد — `BLOCKED` |
| بناء APK بـ`--dart-define` | مؤجل حتى توفير العنوان الحقيقي |
| التغييرات البرمجية | لا تغيير في منطق التسجيل أو المصادقة |

لا يجوز استخدام `localhost` أو `127.0.0.1` أو `10.0.2.2` في APK المخصص للهاتف. ولا يجوز استخدام Fake Backend أو bypass أو حسابات حقيقية أو وضع أي Secret داخل APK أو Git.

## 2. البنية المستهدفة

يجب أن تكون البنية على **خادم Staging مستقل** أو مشروع سحابي مستقل عن Production. يكون الهاتف عميلًا خارجيًا يصل إلى Caddy عبر HTTPS فقط، بينما تبقى API وPostgreSQL وRedis وObject Storage وClamAV داخل شبكة الخادم وغير منشورة مباشرة على الإنترنت.

```text
Android phone
      |
      | HTTPS 443 — staging.<DOMAIN>
      v
Caddy / ACME TLS
      |
      +--> staging-web:80
      |
      +--> staging-api:5000
                 |
                 +--> staging-postgres:5432   [internal only]
                 +--> staging-redis:6379      [internal only]
                 +--> staging-object-storage [internal/local only]
                 +--> staging-clamav:3310     [internal only]
                 +--> staging-smtp:1025       [Mailpit; no real delivery]
                 +--> staging-worker
                 +--> staging-scheduler
```

المستودع يحتوي على `docker-compose.staging.yml` و`deploy/Caddyfile.staging`. يعرّف Compose الخدمات `staging-postgres` و`staging-redis` و`staging-smtp` و`staging-clamav` و`staging-object-storage` و`staging-migrate` و`staging-api` و`staging-worker` و`staging-scheduler` و`staging-web` و`staging-caddy`. شبكة `staging_backend` داخلية، وتُستخدم شبكة `staging_edge` لربط Caddy بالـAPI والواجهة فقط.

## 3. المتطلبات الخارجية التي يجب توفيرها

| المتطلب | شرط القبول | الحالة الحالية |
|---|---|---|
| Staging host مستقل | خادم منفصل عن Production مع عنوان ثابت أو DNS مستقر | `BLOCKED` — غير متوفر |
| نطاق Staging | مثل `staging.<DOMAIN>` يملكه المستخدم | `BLOCKED` — غير متوفر |
| DNS | سجل A/AAAA يشير إلى الخادم، دون خلط Production | `BLOCKED` |
| Firewall | فتح 80/443 فقط للحافة؛ منع PostgreSQL/Redis/SMTP/API المباشر | `BLOCKED` |
| TLS/ACME | Caddy يحصل على شهادة عامة صالحة للنطاق | `BLOCKED` |
| Secret Store | Secret Manager أو ملف خارجي بصلاحية `0600` | `BLOCKED` |
| PostgreSQL Staging | قاعدة مستقلة وبيانات صناعية فقط | `BLOCKED` |
| Redis Staging | instance مستقلة مع password/TLS حسب سياسة الخادم | `BLOCKED` |
| API/Worker/Scheduler | تشغيل صور Staging من نفس المصدر وبـnamespace مستقل | `BLOCKED` |
| Object Storage | MinIO أو S3 مستقل، bucket مستقل، دون بيانات Production | `BLOCKED` |
| ClamAV | daemon مستقل مع INSTREAM وfail-closed | `BLOCKED` |
| SMTP | Mailpit أو SMTP Staging لا يرسل إلى عناوين حقيقية | `BLOCKED` |
| هاتف Android | هاتف على شبكة يستطيع حل النطاق والوصول إلى 443 | `BLOCKED` حتى الاختبار الفعلي |

## 4. الإعدادات السرية خارج Git

يجب حفظ ملف مثل `.env.staging` خارج Git وبصلاحية `0600`، أو تمرير القيم من Secret Store. لا تُكتب القيم في هذه الوثيقة، ولا في سجلات CI، ولا في APK، ولا في shell history.

يجب أن يغطي Secret Store أو الملف الخارجي، بأسماء المتغيرات فقط، الفئات التالية:

| الفئة | أمثلة أسماء مطلوبة |
|---|---|
| هوية البيئة والنطاق | `STAGING_ENVIRONMENT`, `STAGING_DATA_NAMESPACE`, `STAGING_APP_DOMAIN`, `STAGING_APP_BASE_URL`, `STAGING_WEB_URL`, `STAGING_ALLOWED_ORIGINS` |
| PostgreSQL | `STAGING_PGHOST`, `STAGING_PGPORT`, `STAGING_PGUSER`, `STAGING_PGPASSWORD`, `STAGING_PGDATABASE`, `STAGING_DATABASE_URL` |
| Redis | `STAGING_REDIS_HOST`, `STAGING_REDIS_PORT`, `STAGING_REDIS_PASSWORD`, `STAGING_REDIS_URL`, `STAGING_REDIS_TLS`, `STAGING_QUEUE_PREFIX` |
| مفاتيح الجلسات | `STAGING_JWT_ACCESS_SECRET`, `STAGING_JWT_REFRESH_SECRET`, `STAGING_SESSION_IP_HASH_SECRET`, `STAGING_TWO_FACTOR_ENCRYPTION_KEY` |
| Caddy وTLS | `STAGING_ACME_EMAIL`, `STAGING_CADDY_HTTP_PORT`, `STAGING_CADDY_HTTPS_PORT`, `STAGING_TLS_MODE`, `STAGING_TRUST_PROXY` |
| SMTP التجريبي | `STAGING_SMTP_HOST`, `STAGING_SMTP_PORT`, `STAGING_SMTP_FROM`, `STAGING_SMTP_SECURE` |
| Object Storage | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` |
| ClamAV | `STAGING_ATTACHMENT_SCANNING_ENABLED`, `STAGING_CLAMAV_HOST`, `STAGING_CLAMAV_PORT` |
| التشغيل والبيانات | `STAGING_WORKER_CONCURRENCY`, `STAGING_QUEUE_MAX_ATTEMPTS`, `STAGING_QUEUE_BACKOFF_MS`, `STAGING_JOB_TIMEOUT_MS`, `STAGING_SCHEDULER_ENABLED`, `STAGING_TEST_DATA_ENABLED`, `STAGING_TEST_DATA_SEED` |
| المزودات الخارجية | `THREAT_ANALYSIS_PROVIDER`, `URL_INTELLIGENCE_PROVIDER`, `ATTACHMENT_SANDBOX_PROVIDER` وأسماء URL/KEY الخاصة بها تبقى فارغة أو `NOT_CONFIGURED` |

يجب أن تكون `STAGING_APP_BASE_URL` و`STAGING_WEB_URL` و`STAGING_ALLOWED_ORIGINS` عناوين HTTPS حقيقية، وألا تحتوي URL على username أو password. يجب أن تكون أسماء النطاقات وbucket وnamespace منفصلة عن Production. يظل AI Provider وURL Intelligence وAttachment Sandbox الخارجي وOAuth وMonitoring العام `NOT_CONFIGURED` ما لم يوفر المستخدم credentials مخصصة لـStaging ويطلب تفعيلها صراحةً.

## 5. التحقق من الإعداد قبل التشغيل

بعد توفير الملف الخارجي فقط، ومن دون طباعته، تُنفذ الفحوص التالية على خادم Staging:

```bash
chmod 0600 /secure/staging/.env.staging
node scripts/validate-staging-env.mjs /secure/staging/.env.staging --strict

docker compose \
  --env-file /secure/staging/.env.staging \
  -f docker-compose.staging.yml \
  config --quiet
```

يجب أن يفشل validator عند الأسرار الناقصة أو الضعيفة، أو عند روابط HTTP غير المسموح بها، أو عند الإشارة إلى Production، أو عند غياب PostgreSQL/Redis/S3 configuration المطلوبة. لا يُستخدم ملف `.env.staging.example` كأنه بيئة تشغيل حقيقية.

## 6. ترتيب التشغيل

يجب تشغيل الخدمات بالترتيب التالي، مع الحفاظ على عزل الشبكة وعدم نشر قواعد البيانات أو Redis أو API مباشرة:

```bash
docker compose --env-file /secure/staging/.env.staging \
  -f docker-compose.staging.yml \
  up -d \
  staging-postgres staging-redis staging-smtp staging-clamav \
  staging-object-storage staging-object-storage-init

# Migration قبل API

docker compose --env-file /secure/staging/.env.staging \
  -f docker-compose.staging.yml \
  run --rm staging-migrate

docker compose --env-file /secure/staging/.env.staging \
  -f docker-compose.staging.yml \
  up -d staging-api staging-worker staging-scheduler staging-web

# Edge/TLS بعد جاهزية API والواجهة
docker compose --env-file /secure/staging/.env.staging \
  -f docker-compose.staging.yml \
  --profile edge up -d staging-caddy
```

يجب أن يكون `staging-api` مربوطًا داخليًا على port 5000، وأن يكون Caddy هو نقطة الدخول العامة على 80/443. لا يُفتح port 5000 للعامة. يجب أن يبقى ClamAV fail-closed، فلا تُقبل المرفقات أو تُخزن أو تُرسل قبل نجاح الفحص عندما يكون attachment scanning مفعّلًا.

## 7. تحقق DNS وTLS والوصول من شبكة الهاتف

قبل استخدام APK، يجب التحقق من أن النطاق يحل إلى خادم Staging الصحيح من شبكة الهاتف، وليس إلى localhost أو Production:

```bash
getent hosts staging.<DOMAIN>

curl --fail --silent --show-error \
  https://staging.<DOMAIN>/api/health/live

curl --fail --silent --show-error \
  https://staging.<DOMAIN>/api/health/ready

openssl s_client \
  -connect staging.<DOMAIN>:443 \
  -servername staging.<DOMAIN> \
  -verify_return_error </dev/null
```

القبول يتطلب شهادة صالحة للنطاق، سلسلة TLS موثوقة، وعدم وجود redirect إلى HTTP، ونجاح readiness مع PostgreSQL وباقي dependencies المطلوبة. يجب تكرار health checks من الهاتف نفسه عبر شبكة الهاتف أو Wi-Fi، وليس من الخادم فقط.

## 8. اختبار التسجيل وتسجيل الدخول

بعد نجاح HTTPS وreadiness فقط، يُنفذ اختبار التسجيل باستخدام بريد صناعي من `example.invalid` وكلمة مرور مولدة مؤقتًا، عبر API الحقيقي لا عبر Fake Backend. يجب أن تُحذف البيانات بعد الاختبار، ولا تُستخدم عناوين حقيقية.

المسارات المطلوب إثباتها:

```text
GET  https://staging.<DOMAIN>/api/health/ready
POST https://staging.<DOMAIN>/api/auth/register
POST https://staging.<DOMAIN>/api/auth/login
```

يمكن استخدام smoke test الموجود في المشروع بعد تمرير العنوان الحقيقي عبر Secret Store أو environment خارجي، مع عدم كتابة القيمة في Git:

```bash
STAGING_BASE_URL=https://staging.<DOMAIN> \
STAGING_WEB_URL=https://staging.<DOMAIN> \
node scripts/staging-smoke.mjs
```

يجب أن يسجل الاختبار status code وrequest ID والنتيجة العامة فقط، دون passwords أو access tokens أو refresh tokens أو محتوى بريد. التسجيل المقبول هو HTTP `201` مع session response صحيح، ثم Login المقبول هو HTTP `200`. أي نتيجة أخرى تُصنف `FAILED` أو `BLOCKED` حسب سببها، ولا يُقال إن الحساب أُنشئ إلا إذا أثبت API ذلك في نفس بيئة Staging.

## 9. إعداد APK بعد توفير العنوان الحقيقي

لا يبدأ هذا القسم قبل نجاح DNS/TLS وhealth/register/login من البيئة الحقيقية. عندها فقط يُبنى APK من مشروع Flutter الحالي باستخدام عنوان عام HTTPS حقيقي:

```bash
flutter build apk --debug \
  --dart-define=API_BASE_URL=https://staging.<DOMAIN>/api
```

`API_BASE_URL` عنوان عام غير سري، أما كلمات المرور والمفاتيح وtokens فلا تدخل في `--dart-define` ولا APK. يجب بناء APK خارج Git أو حذف مخرجات `build` بعد نسخه إلى مسار خارجي بصلاحية `0600`.

بعد البناء، يجب التحقق من:

```bash
unzip -t <APK>
sha256sum <APK>
/home/ubuntu/android-sdk/build-tools/36.0.0/aapt2 dump badging <APK>
```

ويجب أن يثبت badging:

```text
application-label: Zephyx Mail
package: com.novamail.app
```

كما يجب أن يبقى `novamail_flutter` اسم حزمة Flutter الداخلي، وألا تتغير مسارات أو imports أو API contracts. يجب إجراء فحص نهائي للتأكد من عدم بقاء `10.0.2.2` أو `localhost` أو `127.0.0.1` كعنوان API في إعداد APK الجديد، مع عدم اعتبار أي URL داخل dependency دليلًا على عنوان التطبيق.

## 10. الاختبار من هاتف Android

بعد تثبيت APK الجديد على هاتف Android فعلي، ومن دون الاعتماد على Emulator أو نتيجة بديلة، يكون ترتيب الاختبار:

| الخطوة | شرط النجاح |
|---|---|
| فتح التطبيق | يظهر `Zephyx Mail` لا `NovaMail` أو `novamail_flutter` |
| شبكة الهاتف | النطاق يحل ويصل إلى 443 عبر HTTPS |
| readiness | API يعيد readiness ناجحًا |
| Register | بريد صناعي `example.invalid` فقط، والـAPI يعيد `201` |
| Login | نفس الحساب الصناعي يعيد `200` |
| رسائل الخطأ | تظهر رسالة Backend الآمنة أو سبب اتصال واضح دون tokens أو PII |
| التنظيف | حذف الحساب والبيانات الصناعية بعد الاختبار |

لا يكفي نجاح curl من خادم Staging؛ يجب أن يُثبت الاختبار من الهاتف نفسه. إذا لم يوجد هاتف أو لم يصل إلى الخادم، تبقى Registration وLogin وAndroid runtime `BLOCKED`.

## 11. التشغيل الآمن والتراجع

يجب مراقبة health وreadiness وCaddy logs وAPI logs وworker markers دون تسجيل كلمات المرور أو tokens أو محتوى الرسائل. قبل أي تحديث للصورة، يجب حفظ image digest سابق معروف وتشغيل migration بصورة قابلة للمراجعة. لا تُعكس migration تلقائيًا ولا تُستخدم قاعدة Production في التراجع.

عند انتهاء الجولة، يُنفذ cleanup داخل Staging فقط: حذف البيانات الصناعية، حذف المرفقات التجريبية، إيقاف الحاويات عند عدم الحاجة، إزالة ملفات البيئة المؤقتة من الخادم، وعدم تنفيذ `down -v` إلا بموافقة مالك Staging لأنه يحذف volumes.

## 12. بوابة القبول النهائية

لا يُسلّم APK Staging ولا تُعلن المصادقة ناجحة إلا بعد تحقق جميع الشروط التالية:

| شرط القبول | الحالة الحالية |
|---|---|
| خادم Staging مستقل | `BLOCKED` |
| DNS فعلي للنطاق | `BLOCKED` |
| TLS/ACME صالح | `BLOCKED` |
| Secret Store أو ملف `0600` خارج Git | `BLOCKED` |
| Compose config strict ناجح | `NOT RUN` حتى توفير الإعداد |
| Migrations ناجحة | `NOT RUN` حتى توفير قاعدة Staging |
| `/api/health/ready` عبر HTTPS | `BLOCKED / NOT RUN` |
| Register عبر HTTPS ببيانات صناعية | `BLOCKED / NOT RUN` |
| Login عبر HTTPS ببيانات صناعية | `BLOCKED / NOT RUN` |
| اختبار الهاتف الفعلي | `BLOCKED / NOT RUN` حتى توفير هاتف متصل بالشبكة |
| APK بـ`--dart-define` حقيقي | مؤجل |
| Branding `Zephyx Mail` | محفوظ في مصدر Branding السابق، ويُعاد التحقق في APK Staging الجديد |

## 13. القيود التي لا يجوز تجاوزها

لا يُسمح بتعديل منطق التسجيل لإخفاء مشكلة البنية، أو إضافة Demo Mode، أو bypass، أو Fake Backend، أو استخدام حسابات حقيقية، أو نشر PostgreSQL/Redis/API مباشرة، أو إنشاء tunnel HTTP غير آمن، أو وضع أسرار في APK أو Git، أو تنفيذ `reset` أو `git add` أو Commit أو Push. أي غياب للبنية أو العنوان الحقيقي يبقي الحالة `BLOCKED` ولا يتحول إلى `PASS` بواسطة mock أو fixture أو نجاح health محلي فقط.

## 14. قرار المتابعة المطلوب

العنصر الوحيد المطلوب من مالك البيئة قبل بدء التفعيل هو توفير **عنوان HTTPS حقيقي لخادم Staging مستقل** مع DNS وTLS وSecret Store والموارد الداخلية المذكورة. بعد توفيره يمكن تنفيذ الأقسام 5–10، ثم إعادة بناء APK بعنوان:

```text
https://<staging-host>/api
```

حتى ذلك الحين، لا يوجد APK Staging قابل للاعتماد، ولا يوجد دليل صالح على نجاح Registration أو Login من الهاتف.
