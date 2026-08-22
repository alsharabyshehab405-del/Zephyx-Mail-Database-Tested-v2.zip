# Zephyx Mail — Staging Deployment & Beta Readiness v7

## الغرض والنطاق

هذا الدليل يشرح نشر بيئة Staging معزولة لاختبارات Beta. يجب أن تستخدم Staging قاعدة PostgreSQL وRedis وSMTP وOAuth وObject Storage منفصلة تمامًا عن Production. لا يجوز نسخ بيانات المستخدمين الحقيقية إلى هذه البيئة، ولا استخدام نطاق Production أو مفاتيحه أو webhook secrets الخاصة به.

> **قاعدة أمان:** أي تكامل لا يملك credentials مخصصة لـStaging يُسجّل صراحةً على أنه `not_configured` ويظل معطلًا. لا يُعتبر Fake adapter دليلًا على نجاح مزود خارجي حقيقي.

## المتطلبات المسبقة

يحتاج الخادم إلى Docker Engine وDocker Compose v2، وذاكرة ومساحة تكفي لصورتَي API وWeb وقاعدة PostgreSQL وRedis. يجب توفير DNS منفصل مثل `staging.example.com` إذا كان HTTPS العام مطلوبًا، مع فتح 80 و443 فقط على حافة Caddy. يجب حفظ القيم السرية في Secret Manager أو ملف غير متتبع بصلاحيات `0600`؛ لا تُكتب في Git أو في سجلات CI.

انسخ `.env.staging.example` إلى Secret Manager أو إلى ملف محلي غير متتبع باسم `.env.staging`. قبل التشغيل نفّذ:

```bash
node scripts/validate-staging-env.mjs .env.staging --strict
```

يجب أن يفشل التحقق عند الأسرار الفارغة أو الضعيفة أو عند الإشارة إلى Production. لا تستخدم `--strict` مع ملف المثال نفسه؛ استخدمه للتحقق من ملف Staging ممتلئ بالقيم المخصصة للبيئة.

## إنشاء الخادم وعزل البيئة

أنشئ مضيفًا أو مشروع Cloud منفصلًا عن Production، وطبّق جدارًا ناريًا يمنع الوصول العام إلى PostgreSQL وRedis وSMTP. اسمح بالوصول الإداري عبر VPN أو bastion فقط، واجعل Docker volumes الخاصة بـStaging منفصلة. استخدم حسابات IAM/OS مخصصة، ولا تشارك مسار backup أو bucket مع Production.

يجب أن تكون قيم `STAGING_DATA_NAMESPACE` و`STAGING_QUEUE_PREFIX` فريدة. تحقق من أن `STAGING_PGHOST` و`STAGING_REDIS_HOST` لا يحلان إلى عناوين Production، وأن `STAGING_ALLOWED_ORIGINS` لا يحتوي wildcard.

## تشغيل Docker Compose

للتشغيل المحلي أو الداخلي باستخدام Mailpit وبدون شهادة عامة:

```bash
cp .env.staging.example .env.staging
# املأ القيم السرية في Secret Manager أو محرر آمن، ولا تحفظ الملف في Git.
node scripts/validate-staging-env.mjs .env.staging --strict

docker compose --env-file .env.staging -f docker-compose.staging.yml up -d \
  staging-postgres staging-redis staging-smtp staging-migrate staging-api \
  staging-worker staging-scheduler staging-web
```

تحقق من الخدمات والحالة:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
curl --fail-with-body http://127.0.0.1:3500/api/health/live
curl --fail-with-body http://127.0.0.1:3500/api/health/ready
curl --fail http://127.0.0.1:3300/
```

لا تنشر منفذ PostgreSQL أو Redis أو API مباشرة على الإنترنت. إذا احتجت HTTPS عامًا، شغّل Caddy بعد تسجيل DNS ووضع `STAGING_APP_DOMAIN` و`STAGING_ACME_EMAIL` في Secret Manager:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile edge up -d staging-caddy
curl --fail-with-body https://staging.example.com/api/health/ready
```

تستخدم Caddy شهادة ACME وتُخزّنها في volume خاص بالبيئة. لا تضع الشهادات أو مفاتيحها في المستودع.

## Migrations وبيانات الاختبار الآمنة

ينفذ `staging-migrate` `prisma migrate deploy` بعد جاهزية PostgreSQL. لا تستخدم `prisma db push` ولا تعدّل migrations تاريخية. افحص النتيجة قبل تشغيل API:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --no-log-prefix staging-migrate
```

لإنشاء بيانات Beta استخدم `scripts/staging-seed.mjs` من داخل بيئة Staging فقط. ينشئ السكربت مستخدمين تجريبيين بعناوين نطاق `example.invalid` ومعرّف تشغيل عشوائي، ولا يستورد رسائل أو مرفقات أو حسابات من Production. يجب حذف البيانات التجريبية بعد الجولة أو إعادة إنشاء volumes المعزولة.

## Staging smoke tests

بعد اكتمال الخدمات شغّل:

```bash
STAGING_BASE_URL=http://127.0.0.1:3500 \
STAGING_WEB_URL=http://127.0.0.1:3300 \
node scripts/staging-smoke.mjs
```

يمر الاختبار الأساسي عبر health/live وhealth/ready، ثم ينفذ التسجيل والدخول وتجديد الجلسة، إنشاء Draft وتعديله وإرساله عبر SMTP التجريبي، Inbox والبحث والمجلدات، marker الخاص بالـWorker والـScheduler، وRedis realtime. يختبر المرفقات بعينة صغيرة مولدة داخل الاختبار ولا يقرأ ملفات المستخدمين.

Gmail OAuth وClamAV وFCM وWeb Push وBilling تُختبر فقط إذا كانت مفاتيح Staging المخصصة متوفرة. عند غيابها يطبع الاختبار `not_configured` ويسجلها في التقرير دون اعتبارها نجاح تكامل حقيقي. تُستخدم Mailpit افتراضيًا بدل SMTP خارجي، ويجب فحص الرسالة من Mailpit UI أو API دون إرسالها إلى عناوين حقيقية.

```bash
pnpm run staging:validate
pnpm run staging:seed
pnpm run staging:smoke
pnpm run load:test
```

## Caddy وHTTPS

تأكد من أن `STAGING_APP_DOMAIN` يحل إلى عنوان الخادم وأن البريد المستخدم لـACME مخصص للتشغيل. افحص:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile edge logs staging-caddy
curl --fail https://staging.example.com/api/health/live
```

يجب أن تظهر security headers، وأن يكون backend غير قابل للوصول من الإنترنت مباشرة. استخدم CORS allowlist للنطاق Staging فقط، ولا تستخدم `*`.

## Worker وScheduler

يتصل Worker وScheduler بـPostgreSQL وRedis نفسهما لكن باستخدام namespace Staging. يجب أن يظهر الملف `/tmp/zephyx-worker-ready` و`/tmp/zephyx-scheduler-ready` داخل الحاويتين. أوقف أو شغّل كل خدمة بصورة مستقلة:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop staging-worker staging-scheduler
docker compose --env-file .env.staging -f docker-compose.staging.yml start staging-worker staging-scheduler
```

لا تشغّل أكثر من Scheduler مقصود في بيئة Staging إلا بعد التحقق من advisory lock وdeterministic job IDs. عند فشل Worker، اترك Outbox lease ينتهي ثم راقب الاستعادة؛ لا تسجل Job كمكتملة يدويًا.

## Backup وRestore

اضبط `STAGING_BACKUP_DIR` على تخزين مشفر منفصل. نفذ backup يدويًا قبل اختبار Beta:

```bash
DATABASE_URL="$STAGING_DATABASE_URL" \
BACKUP_DIR="$STAGING_BACKUP_DIR" \
./scripts/backup-postgres.sh
```

تحقق من checksum وRestore في قاعدة مؤقتة لا في قاعدة Staging العاملة:

```bash
DATABASE_URL="$STAGING_RESTORE_VERIFY_DATABASE_URL" \
BACKUP_FILE=/secure/staging-backups/<dump-file> \
ALLOW_DATABASE_RESTORE=YES_I_HAVE_VERIFIED_THE_TARGET \
./scripts/verify-backup-restore.sh
```

لا تستخدم `--clean` على قاعدة متصلة بالمستخدمين إلا بعد نافذة صيانة ومراجعة مستقلة. احتفظ بنسخ Staging وفق مدة قصيرة، واحذفها عند انتهاء Beta.

## Rollback

إذا فشل نشر صورة جديدة، أوقف التحديث قبل migration غير قابلة للعكس، وارجع إلى image digest السابق المعروف. لا تحذف البيانات ولا تعكس migration تلقائيًا. استخدم:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
# عدّل image tag/digest إلى الإصدار السابق المعتمد
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --no-deps staging-api staging-worker staging-scheduler staging-web
```

إذا احتاج rollback إلى قاعدة بيانات، استرجع إلى قاعدة مؤقتة أولًا وقارن schema والبيانات، ثم نفّذ الإجراء المعتمد مع `ALLOW_DATABASE_RESTORE` صريح. سجّل القرار والـcommit والـmigration في سجل الحادثة.

## إيقاف البيئة وإعادة تشغيلها

لإيقاف الخدمات مع الإبقاء على volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml stop
```

لإيقافها وحذف الحاويات فقط:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

لا تستخدم `down -v` إلا بعد موافقة مالك بيئة Staging لأن ذلك يحذف قاعدة الاختبار وRedis data. بعد إعادة التشغيل نفذ health checks وsmoke test مرة أخرى.

## قبول Beta

لا تُعتبر Staging جاهزة لـBeta إلا بعد نجاح env validation strict، migrations، health/readiness، registration/login/refresh، draft/send عبر Mailpit، Inbox/search/folders، attachment fixture، Redis realtime، Worker/Scheduler markers، backup/restore verification، وsecret scan. يجب أن يحتوي تقرير القبول على قائمة واضحة بكل external adapter: `configured` أو `not_configured`، وأن يذكر صراحةً عدم اختبار Gmail OAuth أو FCM أو Web Push أو ClamAV أو Billing الحقيقي عند غياب credentials.
