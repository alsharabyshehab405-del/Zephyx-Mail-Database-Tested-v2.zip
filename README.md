# Zephyx Mail — Production Clean v1

> منصة بريد إلكتروني متكاملة مبنية على React وExpress وPostgreSQL، مع مزامنة Gmail، ومرفقات دائمة، ومصادقة متقدمة، وميزات إنتاجية وذكاء اصطناعي، ودعم العربية وPWA.

هذه النسخة هي **خط الإنتاج النظيف** للمشروع. المصدر النشط موجود داخل مساحة عمل `pnpm` في `artifacts/api-server` و`artifacts/novamail-web` و`lib/*`. أزيلت حزم الرقع القديمة، والنسخ الاحتياطية، والنموذج التجريبي المكرر، وملفات التصحيح، ومخرجات TypeScript المؤقتة، بينما بقيت جميع الميزات المدمجة في المصدر النهائي. ابتداءً من v4 تُشغّل المهام الخلفية في Worker/Scheduler مستقلين بدل مؤقت داخل API.

## المكونات الرئيسية

| الطبقة | التقنية والمسار |
|---|---|
| واجهة الويب | React 19 وVite وTypeScript وTailwind CSS داخل `artifacts/novamail-web` |
| الخادم | Node.js 24 وExpress 5 وTypeScript داخل `artifacts/api-server` |
| قاعدة البيانات | PostgreSQL 16، مع Drizzle للوصول التشغيلي وPrisma للتحقق والهجرات |
| العقود | OpenAPI داخل `lib/api-spec`، وعميل React وZod مولدان داخل `lib/api-client-react` و`lib/api-zod` |
| تطبيق الهاتف | Flutter داخل `mobile/novamail-flutter` |
| النشر | Docker Compose أو Replit، مع API وWorker وScheduler منفصلين في v4 وواجهة المستخدم دون تغيير |

## الميزات المحفوظة

| المجال | الميزات |
|---|---|
| البريد | صندوق الوارد، البحث، المجلدات، المحادثات، الرد والتحويل، Gmail synchronization، المرفقات، Scheduled Send، Undo Send، Snooze |
| المصادقة | التسجيل والدخول، JWT، 2FA، التحقق من البريد، استعادة كلمة المرور، الجلسات النشطة وإبطالها |
| الذكاء الاصطناعي | المساعد، كتابة الرسائل، تلخيص المحادثات، الردود السريعة، Smart categories |
| الإنتاجية | Tasks، Calendar، Templates، Analytics، واكتشاف طلبات الاجتماعات |
| الإدارة والتجربة | Admin panel، العربية RTL، الوضع الداكن، التصميم المتجاوب، PWA وإشعارات سطح المكتب |

## بنية المستودع

```text
zephyx-mail-production-clean/
├── artifacts/
│   ├── api-server/              # Express API، Prisma، الاختبارات، وبناء الخادم
│   └── novamail-web/            # React/Vite، PWA، وNginx
├── lib/
│   ├── api-client-react/        # عميل React Query المولد
│   ├── api-spec/                # عقد OpenAPI
│   ├── api-zod/                 # مخططات Zod المولدة
│   └── db/                      # مخططات Drizzle
├── mobile/novamail-flutter/     # تطبيق Flutter
├── docker-compose.yml
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── .env.example
```

## المتطلبات

يتطلب تشغيل مساحة العمل **Node.js 24** و**pnpm 11.21.0** وPostgreSQL 16. يمكن بدلًا من تثبيت PostgreSQL محليًا استخدام Docker وDocker Compose. راجع وثائق Node.js وpnpm وDocker الرسمية عند إعداد بيئة جديدة.[1] [2] [4]

```bash
node --version
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm --version
```

## التشغيل المحلي من الصفر

### 1. تثبيت الاعتماديات

من جذر المستودع نفّذ الأمر التالي. يجب استخدام القفل المرفق وعدم إنشاء `package-lock.json` أو `yarn.lock`.

```bash
pnpm install --frozen-lockfile
```

### 2. إنشاء ملف البيئة

```bash
cp .env.example .env
```

عدّل `.env` بقيم بيئتك. لا تضع القيم الحقيقية داخل ملفات TypeScript أو Dockerfile أو Git، ولا ترفع `.env` إلى المستودع.

| المتغير | الغرض | مطلوب |
|---|---|---:|
| `DATABASE_URL` | اتصال PostgreSQL | نعم |
| `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET` | توقيع رموز المصادقة | نعم |
| `SESSION_IP_HASH_SECRET` | تجزئة عنوان IP في سجل الجلسات | موصى به |
| `TWO_FACTOR_ENCRYPTION_KEY` | تشفير سر TOTP | لتفعيل 2FA |
| `SMTP_HOST` و`SMTP_USER` و`SMTP_PASS` و`SMTP_FROM` | رسائل التحقق واستعادة كلمة المرور | لميزات البريد الصادر |
| `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` | OAuth الخاص بـ Gmail | لمزامنة Gmail |
| `GOOGLE_REDIRECT_URI` | مسار عودة Google، وينتهي بـ `/api/auth/google/callback` | لمزامنة Gmail |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | تشفير رموز OAuth المخزنة | لمزامنة Gmail |
| `REPLIT_OBJECT_STORAGE_BUCKET_ID` أو `APP_STORAGE_BUCKET_ID` | حاوية تخزين المرفقات | للمرفقات الدائمة |
| `GEMINI_API_KEY` | مزود ميزات AI | اختياري |
| `ALLOWED_ORIGINS` | قائمة أصول CORS مفصولة بفواصل | نعم في الإنتاج |

يمكن إنشاء أسرار عشوائية محليًا دون حفظها في سجل المصدر:

```bash
openssl rand -base64 48   # JWT/session secret
openssl rand -base64 32   # Gmail/2FA encryption key
```

### 3. إعداد قاعدة البيانات

أنشئ قاعدة PostgreSQL واضبط `DATABASE_URL`. ثم نفّذ التحقق والتوليد والهجرات من حزمة الخادم:

```bash
pnpm --dir artifacts/api-server run prisma:validate
pnpm --dir artifacts/api-server run prisma:generate
pnpm --dir artifacts/api-server run prisma:migrate:deploy
```

مسار `prisma:migrate:deploy` هو المسار الإنتاجي الموحد. يتضمن هجرات المصادقة و2FA والذكاء الاصطناعي والإنتاجية، إضافة إلى Gmail وبيانات كائنات المرفقات. لا يلزم تطبيق ملفات SQL يدوية منفصلة. يوضح دليل Prisma الرسمي أن `migrate deploy` هو أمر تطبيق الهجرات المعلقة في بيئات الاختبار والإنتاج.[3]

> إذا كنت تنقل تثبيتًا قديمًا كان يخزن ملفات المرفقات على القرص المحلي، فخذ نسخة احتياطية من قاعدة البيانات والملفات أولًا، واضبط حاوية التخزين، ثم شغّل `node artifacts/api-server/scripts/migrate-legacy-attachments.mjs` مرة واحدة. لا تشغّل هذا السكربت على تثبيت جديد.

### 4. تشغيل التطوير

شغّل الخادم والواجهة في طرفيتين منفصلتين:

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
pnpm --filter @workspace/novamail-web run dev
```

المنفذ الافتراضي للخادم هو `3000` عند التشغيل المباشر ما لم تضبط `PORT`. اضبط `NOVAMAIL_WEB_URL` و`ALLOWED_ORIGINS` على عنوان واجهة Vite المحلية.

## أوامر الجودة والبناء

نفّذ الأوامر التالية من جذر المستودع قبل أي نشر:

```bash
pnpm run typecheck
pnpm run build
pnpm --dir artifacts/api-server run test:run
pnpm --dir artifacts/api-server run test:jest
pnpm --dir artifacts/api-server run prisma:validate
pnpm --dir artifacts/api-server run prisma:generate
```

| الأمر | ما يتحقق منه |
|---|---|
| `pnpm run typecheck` | المكتبات والخادم والواجهة وجميع استيرادات TypeScript |
| `pnpm run build` | بناء الخادم والواجهة وحزم مساحة العمل |
| `test:run` | اختبارات Vitest، بما فيها مسارات API التي تحتاج PostgreSQL |
| `test:jest` | اختبارات الوحدة الخاصة بوحدات الإنتاجية وتحليل الاجتماعات |
| `prisma:validate` | صحة مخطط Prisma وإعداد مصدر البيانات |
| `prisma:generate` | توافق العميل المولد مع المخطط الحالي |

تحتاج اختبارات التكامل إلى قاعدة PostgreSQL قابلة للاتصال عبر `DATABASE_URL`. لا تستخدم قاعدة الإنتاج لتنفيذ الاختبارات.

## تشغيل Docker Compose

### 1. تجهيز القيم

انسخ ملف البيئة، ثم اضبط على الأقل `PGPASSWORD` و`DATABASE_URL` وسرّي JWT. داخل شبكة Compose يجب أن يشير مضيف قاعدة البيانات في `DATABASE_URL` إلى الخدمة `postgres`:

```dotenv
PGUSER=zephyx
PGPASSWORD=replace-with-a-strong-password
PGDATABASE=zephyx
DATABASE_URL=postgresql://zephyx:replace-with-a-url-encoded-password@postgres:5432/zephyx
JWT_ACCESS_SECRET=replace-with-a-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-random-secret
```

### 2. البناء والتشغيل

```bash
docker compose build
docker compose up -d
```

تشغّل Compose خدمة `migrate` مرة واحدة بعد جاهزية PostgreSQL، ولا يبدأ API إلا بعد نجاح الهجرات. تصبح الواجهة على `http://localhost:3000`، ويصبح API مباشرة على `http://localhost:5000`. يمرر Nginx طلبات `/api/` من الواجهة إلى خدمة الخادم داخل الشبكة.[4]

```bash
docker compose ps
docker compose logs -f migrate api web
curl --fail http://localhost:5000/api/healthz
```

لإيقاف الخدمات دون حذف بيانات PostgreSQL:

```bash
docker compose down
```

ولحذف البيانات المحلية أيضًا استخدم `docker compose down -v` فقط عندما تكون متأكدًا أن النسخة الاحتياطية متاحة.

## النشر على Replit

يحتوي المستودع على `.replit` نظيف يعرّف بناء الواجهة والخادم وتشغيل API. عند وجود `artifacts/novamail-web/dist/public` في الإنتاج، يقدمه الخادم تلقائيًا ويعيد مسارات SPA إلى `index.html`، ولذلك يعمل النشر أحادي العملية.

أضف القيم السرية في **Replit Secrets** بدلًا من الملفات. اربط App Storage أو أنشئ حاوية واضبط `REPLIT_OBJECT_STORAGE_BUCKET_ID` عند الحاجة. لا تستخدم أي معرف حاوية أو OAuth يعود إلى بيئة أخرى.

## إعداد Gmail

أنشئ OAuth Web Client في Google Cloud، وأضف مسار العودة المطابق تمامًا لقيمة `GOOGLE_REDIRECT_URI`. يحتاج التطبيق إلى بيانات `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` وإلى مفتاح مستقل في `GMAIL_TOKEN_ENCRYPTION_KEY`. راجع إرشادات Google الرسمية الخاصة بتطبيقات OAuth على الويب وضبط redirect URI.[5]

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://mail.example.com/api/auth/google/callback
GMAIL_TOKEN_ENCRYPTION_KEY=
NOVAMAIL_WEB_URL=https://mail.example.com
GMAIL_INITIAL_SYNC_MAX=100
```

تدعم الوحدة الاتصال والفصل والمزامنة الأولية والمتزايدة، والخيوط، والملصقات، والمرفقات، والتصنيف الذكي بأفضل جهد. إعدادات Pub/Sub اختيارية وتستخدم `GMAIL_PUBSUB_OIDC_AUDIENCE` و`GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`.

## المرفقات

تخزن بيانات المرفقات الثنائية في **Replit App Storage**، بينما تحفظ PostgreSQL بيانات الملكية والاسم والنوع والحجم والبصمة. يجب ضبط معرف الحاوية أو ربط App Storage في بيئة Replit قبل رفع الملفات. تستخدم الاختبارات مخزنًا مؤقتًا في الذاكرة ولا تحتاج حاوية خارجية.

## 2FA والتحقق واستعادة الحساب

لتفعيل 2FA اضبط `TWO_FACTOR_ENCRYPTION_KEY` على قيمة عشوائية مستقلة، ويمكن تخصيص اسم الجهة الظاهر في تطبيق المصادقة عبر `TWO_FACTOR_ISSUER`. تحتاج رسائل التحقق واستعادة كلمة المرور إلى SMTP صالح وإلى `APP_BASE_URL` يشير إلى الواجهة العامة.

## الذكاء الاصطناعي

ميزات AI اختيارية. عند غياب `GEMINI_API_KEY` لا يجب أن يتعطل البريد الأساسي أو مزامنة Gmail؛ تعرض نقاط AI خطأ إعداد واضح، وتستمر عملية المزامنة دون منع إدخال الرسائل. اضبط النموذج عبر `GEMINI_MODEL` عند الحاجة.

## PWA والعربية

توجد ملفات PWA في `artifacts/novamail-web/public/manifest.webmanifest` و`artifacts/novamail-web/public/sw.js`. يسجل التطبيق Service Worker من `src/main.tsx`. تدعم الواجهة الإنجليزية والعربية، ويطبق اتجاه RTL على جذر المستند مع أنماط متجاوبة.

## تطبيق Flutter

تطبيق الهاتف مستقل عن مساحة عمل pnpm:

```bash
cd mobile/novamail-flutter
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api
```

استخدم عنوان المضيف المناسب للمحاكي أو الجهاز، ولا تضع أسرار الخادم في تطبيق الهاتف.

## سياسة الأسرار والملفات المولدة

ملفا `.gitignore` و`.dockerignore` يحجبان ملفات البيئة والأسرار والاعتماديات ومخرجات البناء والتغطية والنسخ الاحتياطية وملفات التصحيح والأرشيفات. يجب أن يبقى `.env.example` خاليًا من القيم الحقيقية. لا تعدّل الملفات المولدة داخل `lib/api-client-react/src/generated` أو `lib/api-zod/src/generated` يدويًا؛ عدّل `lib/api-spec/openapi.yaml` ثم شغّل:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## مراجع

[1]: https://nodejs.org/en/download "Node.js Downloads"
[2]: https://pnpm.io/installation "pnpm Installation"
[3]: https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production "Prisma Migrate in development and production"
[4]: https://docs.docker.com/compose/ "Docker Compose Documentation"
[5]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"

## Production Security & Reliability v3

يجب أن يوفّر تشغيل Production قيمًا فريدة لا تقل عن 32 محرفًا لكل من `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET` و`SESSION_IP_HASH_SECRET` و`TWO_FACTOR_ENCRYPTION_KEY` و`GMAIL_TOKEN_ENCRYPTION_KEY`؛ وتُرفض القيم الافتراضية أو الضعيفة عند بدء الخادم. لا تُحفظ هذه القيم في المستودع.

تُفحص المرفقات بواسطة Magic Bytes، ويُرفض اختلاف MIME أو الامتداد عن التوقيع، وتُنظّف أسماء الملفات وتُمنع مسارات traversal. الحد الأقصى هو 25 MB للملف و50 MB للمجموع و10 مرفقات. نقطة الربط `AttachmentScanner` مصممة لتطبيق ClamAV في Production، بينما يستخدم الاختبار Scanner وهميًا deterministic فقط.

يوفر الخادم `/api/health/live` لفحص حياة العملية و`/api/health/ready` لفحص جاهزية PostgreSQL دون كشف تفاصيل الاتصال. ويمكن للعملاء إرسال `Idempotency-Key` مع `POST /api/emails` لمنع إنشاء رسالة مكررة عند إعادة المحاولة. تُسجل العمليات الحساسة في `audit_logs` دون كلمات مرور أو Tokens أو محتوى الرسائل.

### تصحيحات v3.1

يستخدم Adapter ClamAV بروتوكول `INSTREAM` عبر `CLAMAV_HOST` و`CLAMAV_PORT`. يبقى رفع المرفقات في Production **مغلقًا افتراضيًا** حتى ضبط `ATTACHMENT_SCANNING_ENABLED=true` وتوفير ClamAV؛ وأي timeout أو خطأ من الماسح يرفض الرفع بنمط fail-closed. تُرفض أرشيفات ZIP العامة لتجنب ZIP bombs، بينما تُقبل ملفات Office Open XML فقط بعد التعرف على بنية الحاوية، وتُدعم ملفات TXT/CSV النصية مع حدود الحجم.

تُفعّل 2FA وGmail صراحة عبر `ENABLE_2FA` و`ENABLE_GMAIL`. لا يطلب الخادم مفتاح الميزة إلا عند تفعيلها، لكن أسرار JWT وRefresh وIP hashing تبقى مطلوبة دائمًا في Production.

## Scalability & Background Jobs v4

تنقل هذه المرحلة التسليم المجدول وUndo Send من أي مؤقت داخل API إلى Outbox دائم في PostgreSQL وطابور `email-scheduled` مبني على Redis وBullMQ. تُنشأ Email وOutbox في transaction PostgreSQL واحدة؛ ولا يُتصل بـRedis داخل transaction. بعد Commit يحاول API النشر السريع، بينما يلتقط Scheduler الصف لاحقًا إذا تعذر Redis. لا يبدأ API أي Scheduler؛ ويمكن تشغيل Scheduler مستقل واحد أو عدة نسخ، إذ يحميه `pg_try_advisory_xact_lock` داخل transaction من تنفيذ الدورة نفسها بالتوازي.

| العملية | الحالة في v4 | السبب |
|---|---|---|
| Scheduled Send وUndo Send | Outbox + `email-scheduled` + Worker | يحتاجان تأخيرًا وإعادة محاولة وLease واستعادة بعد انهيار Worker |
| إرسال فوري بلا تأخير | متزامن داخل API | يحافظ على استجابة API الحالية ولا يضيف latency غير متفق عليه |
| Gmail synchronization وWebhooks | لم تُنقل | لا توجد في النسخة الحالية عملية طويلة أو Scheduler فعّال قابل للنقل؛ تُنقل لاحقًا فقط بعد عقد غير متزامن واختبارات Regression |
| AI processing | لم يُنقل | العقود الحالية متزامنة، والنقل الناقص سيكسر التوافق مع الواجهة |
| Maintenance | لم تُنشأ له Queue شكلية | لا توجد مهمة دورية فعّالة في النسخة الحالية |

### تشغيل العمليات

بعد تشغيل Redis وPostgreSQL وتطبيق migrations، شغّل API وWorker وScheduler في عمليات منفصلة:

```bash
pnpm --dir artifacts/api-server run dev
pnpm --dir artifacts/api-server run start:worker
SCHEDULER_ENABLED=true pnpm --dir artifacts/api-server run start:scheduler
```

يُستخدم `docker compose up -d` لتشغيل `postgres` و`redis` و`migrate` و`api` و`worker` و`scheduler` و`web`. خدمة Redis داخل شبكة Compose فقط ولا تُنشر على منفذ عام. افتراضيًا `SCHEDULER_ENABLED=false` في API، ولا يُفعّل إلا في عملية Scheduler المخصصة.

### Retry وDead-letter

يُخزّن Outbox `pending` و`publishing` و`processing` و`completed` و`failed` و`dead_letter` و`delivery_unknown`، مع `attempts` و`max_attempts` و`next_attempt_at` و`lease_expires_at` و`last_error` المنقّى. PostgreSQL هي المالك الوحيد لـRetry وbackoff؛ كل نشر إلى BullMQ يستخدم محاولة واحدة فقط، ثم تُحفظ حالة الفشل قبل إزالة Job Redis. يعيد Scheduler نشر الصفوف عند حلول `next_attempt_at`، ويستعيد publishing/processing leases المنتهية. الأخطاء الدائمة تذهب إلى dead-letter، أما timeout أو socket uncertainty فتنقل إلى `delivery_unknown` وتتوقف معها المحاولة الآلية حتى المصالحة.

### حدود ضمان الإرسال

لا يدّعي النظام exactly-once مع مزود بريد خارجي. الضمان التشغيلي هو at-least-once مع حماية عملية من التكرار عبر Outbox وJob IDs والحالات الذرية. لا يستخدم Worker `Promise.race` لقطع عملية SMTP؛ يستخدم AbortSignal تعاونيًا، بينما يفرض SMTP adapter connection/greeting/socket timeouts فعلية. إذا بقيت نتيجة المزود غير معروفة بعد timeout، تُسجل `delivery_unknown` ولا تُعاد المحاولة آليًا، وتبقى نافذة المصالحة الخارجية موثقة ومراقبة.

### Health وMetrics

يظل `/api/health/live` مستقلًا عن الخدمات الخارجية، ويفحص `/api/health/ready` PostgreSQL، بينما يفحص `/api/health/worker/ready` اعتماديات Worker من PostgreSQL وRedis ولا يدّعي حياة Worker process نفسه. يعرض `/api/metrics` مقاييس Prometheus آمنة للمسؤولين فقط، مثل Redis status وqueue lag بالثواني وstale processing leases وdead-letter وdelivery_unknown وretry count وduration، ولا يعرض connection strings أو Job payloads أو محتوى البريد أو OAuth tokens.

اختبارات Queue تستخدم Redis الحقيقي داخل CI وتستدعي Worker processor الحقيقي، وتختبر Job ID lifecycle ومنع المعالجة المكررة وإعادة الإضافة بعد إزالة Job المكتملة. اختبارات PostgreSQL تختبر Schedulerين متزامنين، transactional rollback، Claim الذري، استعادة Lease، maxAttempts، retry/backoff، dead-letter، delivery_unknown، وإرسال الرسائل المجدولة دون تكرار، مع إبقاء اختبارات Security & Reliability v3 السابقة ضمن مجموعة الاختبارات.
