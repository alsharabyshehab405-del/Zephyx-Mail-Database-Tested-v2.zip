# تقرير جاهزية التوسع — Zephyx Mail

## نطاق التقرير

يصف هذا التقرير حالة جاهزية التوسع في الفرع الحالي بعد تنفيذ تحسينات محددة وقابلة للقياس على مسارات PostgreSQL وRedis وoutbox وSSE وobservability. لم تُنفذ sharding أو Kafka أو إعادة كتابة لقاعدة البيانات، لأن الاختبارات الحالية لم تثبت ضرورتها. لم يتغير منطق Threat Protection v1، وبقي فحص ClamAV **fail-closed**.

المصدر المستخدم هو نسخة العمل الرسمية المحلية من الفرع `archive-source-work` عند بداية هذه الدورة:

```text
Repository: alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip
Branch:    archive-source-work
HEAD:      eb34413be825b629e4af494016d92ab68e4586dc
```

## التحسينات المنفذة

| المجال | التنفيذ الفعلي | الأثر المتوقع |
|---|---|---|
| PostgreSQL pool | إضافة `PG_POOL_MAX` و`PG_POOL_MIN` و`PG_POOL_IDLE_TIMEOUT_MS` و`PG_POOL_CONNECTION_TIMEOUT_MS` و`PG_POOL_MAX_USES` مع حدود آمنة؛ الافتراضي `max=20` | ضبط الاتصالات لكل بيئة ومنع pool غير محدود أو انتظار طويل |
| Email listing | إضافة فهارس folder/unread/custom-folder مع `(created_at DESC, id DESC)`؛ cursor pagination كانت موجودة وأُبقيت كما هي | تقليل كلفة صفحات البريد العميقة وتقليل الاعتماد على offset في المسار cursor |
| Search/labels | إضافة فهرس GIN للـlabels مع الإبقاء على GIN للـ`search_document` وفهارس trigram الموجودة | تحسين عمليات label وfull-text الحالية |
| Scheduler/outbox | تحويل reservation إلى `UPDATE ... FROM` ذري مع `FOR UPDATE SKIP LOCKED`، وترتيب due rows؛ إضافة فهرس `status/available_at/next_attempt_at/id` | منع الحجز المكرر عند التزامن، وتحسين recovery والـscheduler المتعدد |
| Scheduler batch | إضافة `SCHEDULER_RESERVATION_LIMIT` بحد افتراضي 100 وحد أعلى 1000 | ضبط ضغط PostgreSQL وRedis تدريجيًا |
| SSE/realtime | تحويل replay من stream عالمي إلى Redis stream مستقل لكل مستخدم، مع نافذة replay محدودة، وتهيئة subscriber أحادية لمنع duplicate listeners | جعل reconnect لكل مستخدم قريبًا من حجم نافذته بدل مسح stream عالمي كامل |
| Realtime safety | event IDs عشوائية عالمية وdedup محدود إلى 10,000 عنصر | منع تصادم IDs بين streams ومنع نمو الذاكرة بلا حد |
| Metrics | إضافة PostgreSQL pool gauges وoperation counters/latency وemail dispatch وworker failure metrics إلى Prometheus output | قياس pool pressure وqueue/worker latency بدل الاعتماد على logs فقط |
| Load harness | إضافة `scripts/scalability-load-test.mjs` و`pnpm run load:scalability`؛ يرفض المضيف غير المحلي ويضع حدودًا للطلبات والتزامن | قياس آمن محلي دون إرسال حمل إلى بيئة إنتاج |

## فصل الأعمال الثقيلة

تسليم البريد المجدول مفصول حاليًا عن API عبر PostgreSQL outbox وBullMQ Worker، مع retry وlease وidempotency وgraceful shutdown. كما أن scheduler لا يرسل البريد نفسه؛ بل ينقل العمل إلى queue.

أما فحص المرفقات وقراءة bytes المرفق عند الإرسال وتحليل التهديدات ومسارات التقارير وبعض عمليات الاستيراد والإشعارات، فليست كلها queues مستقلة في هذه الدورة. بقي ClamAV في المسار الآمن الحالي ولم يُعطل أو يُحوّل إلى fail-open. لذلك لا تُعد هذه النسخة إثباتًا لفصل كامل لكل الأعمال الثقيلة عند مليون مستخدم؛ يلزم في المرحلة التالية queues متخصصة مع حدود مستقلة وbackpressure، بعد قياس حمل حقيقي يثبت الحاجة.

## القياس المحلي الآمن

استخدم harness محليًا فقط على `127.0.0.1` مع `/api/healthz`. قيم `virtualUsers` هي تسميات لتخطيط السعة وليست إنشاء مستخدمين حقيقيين أو إثباتًا لقدرة إنتاجية. عدد الطلبات بقي محدودًا عمدًا.

| تسمية السعة | الطلبات | التزامن | الفشل | زمن الجدار | P50 | P95 | P99 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10,000 مستخدم افتراضي | 500 | 50 | 0 | 352.42 ms | 19.40 ms | 47.89 ms | 242.45 ms |
| 100,000 مستخدم افتراضي | 1,000 | 100 | 0 | 498.19 ms | 31.27 ms | 100.05 ms | 246.01 ms |
| 1,000,000 مستخدم افتراضي | 2,000 | 100 | 0 | 825.93 ms | 32.50 ms | 77.07 ms | 89.10 ms |

> هذه النتائج تقيس endpoint صحة محليًا على جهاز الاختبار فقط. لا تقيس API المصادق عليه، ولا PostgreSQL تحت بيانات إنتاج، ولا Redis cluster، ولا SSE connections، ولا attachment scanning، ولا SMTP throughput. لذلك لا يجوز تفسيرها كإثبات أن النظام يخدم مليون مستخدم إنتاجيًا.

## التقييم حسب الحجم

### 10,000 مستخدم

يدعم التصميم الحالي مرحلة 10,000 مستخدم كتوسع أولي مشروط بتشغيل PostgreSQL وRedis مُدارين، ضبط pool والـrate limits، إبقاء cursor pagination، تشغيل Worker وScheduler منفصلين، واستخدام Object Storage حقيقي بدل تخزين الذاكرة. يلزم مراقبة pool waiting وqueue lag وworker failures وHTTP latency قبل فتح حمل فعلي.

### 100,000 مستخدم

تحتاج هذه المرحلة إلى تشغيل عدة API instances stateless خلف load balancer، PostgreSQL primary مع read replicas أو استراتيجية قراءة مناسبة، Redis مُدار مع حدود ذاكرة وretention، Workers منفصلة حسب نوع العمل، Object Storage streaming، وضبط SSE connection budgets. كما يجب إجراء load test مصادق عليه على البريد والبحث والـSSE والمرفقات بدل health-only.

### مليون مستخدم وأكثر

لا تعتبر النسخة الحالية جاهزة للمليون إنتاجيًا. يلزم إثبات حمل حقيقي على بيئة staging مماثلة للإنتاج، ثم إضافة queue classes مستقلة للأعمال الثقيلة، search backend أو read model إذا أثبتت EXPLAIN/latency الحاجة، توزيع realtime مع retention واستراتيجية reconnect، إدارة PostgreSQL connection budget على مستوى كل instance، وقياس tenant fairness. قد تصبح partitioning أو sharding أو Kafka ضرورية، لكن لا توجد أدلة حالية تبرر إدخالها الآن.

## الحدود الحالية والاختناقات المتبقية

| الاختناق | الحالة الحالية | شرط الانتقال |
|---|---|---|
| PostgreSQL | pool قابل للضبط وفهارس موجهة؛ ما زال `COUNT(*)` الإجمالي يُنفذ مع list request | قياس p95 على بيانات كبيرة قبل إضافة count cache أو read model |
| البحث | PostgreSQL FTS/trigram موجودان؛ توجد فلاتر JSONB في بعض المسارات | EXPLAIN وتحميل بحث حقيقي قبل خدمة بحث مستقلة |
| المرفقات | Object Storage abstraction موجود؛ القراءة والإرسال يستخدمان buffers؛ ClamAV fail-closed | streaming وasync scan/quarantine عند إثبات ضغط الذاكرة أو latency |
| SSE | Redis per-user streams وPub/Sub؛ حد افتراضي 20 اتصالًا لكل مستخدم وreplay افتراضي 100 | اختبار آلاف الاتصالات على عدة API instances وقياس Redis memory/reconnect storm |
| Workers | email dispatch مفصول، graceful shutdown وlease موجودان؛ queue واحدة أساسية | queues متخصصة للأعمال الثقيلة مع backpressure وworker pools مستقلة |
| Redis | يستخدم للـqueue وSSE وrate limits؛ لا يوجد Redis Cluster في الاختبار | Managed Redis/cluster عند تجاوز حدود الذاكرة أو throughput |
| Object Storage | provider الحقيقي يبقى `NOT_CONFIGURED` في بيئة الاختبار؛ test mode يستخدم ذاكرة | تهيئة provider حقيقي بسياسة tenant isolation وretention |

## اختبارات التحقق الفعلية

| الاختبار | النتيجة |
|---|---|
| TypeScript typecheck | PASS |
| API Integration على قاعدة PostgreSQL فارغة | **143/143 PASS**، 22 ملف اختبار |
| API unit/Jest | **3/3 PASS**، 1 suite |
| Enterprise/Scalability targeted integration | **8/8 PASS**، وتشمل فهارس PostgreSQL وreservation المتوازي وrealtime وhealth |
| Playwright الكامل | **42/42 PASS** |
| Flutter المباشر من `mobile/novamail-flutter` | **69/69 PASS** |
| Build | PASS؛ تحذير chunk رئيسي بحجم 921.18 kB فقط |
| OpenAPI | PASS؛ 76 paths و77 schemas |
| Prisma validate | PASS |
| Prisma migrations من قاعدة فارغة | PASS؛ 22 migration، ومنها migration التوسع |
| Prisma generate | PASS |
| Secret scan | PASS؛ 945 ملفًا متتبعًا |
| SBOM | PASS؛ 119 components |
| Dependency audit | PASS؛ لا توجد vulnerabilities معروفة في الفحص |
| Load harness | 3 مستويات محلية، جميعها 0 failed؛ 500/1,000/2,000 طلبًا، وزمن الجدار 352.42/498.19/825.93 ms على الترتيب |

## Migrations

أُضيفت migration append-only واحدة:

```text
artifacts/api-server/prisma/migrations/20260826100000_scalability_readiness_indexes/migration.sql
```

تضيف فهارس فقط، ولا تحتوي على `DROP TABLE` أو `DROP COLUMN` أو إعادة كتابة للبيانات. كما تمت مزامنة Drizzle وPrisma schema معها.

## الخدمات غير المهيئة

تبقى الخدمات التالية `NOT_CONFIGURED` عند غياب إعدادات حقيقية: مزود ThreatAnalysis الخارجي، Gmail OAuth، Outlook، SMTP الخارجي، FCM، Web Push، AI provider، Billing/payment provider، وproduction Object Storage. لم تُضف credentials أو أسرار إلى المستودع. لا يُسمح بتجاوز ClamAV عند عدم توفره؛ يظل السلوك fail-closed.

## الخلاصة

النسخة **جاهزة لتجربة توسع محلية ومراقبة محدودة عند 10,000 مستخدم** بعد تهيئة البنية المُدارة والـobservability. وهي **ليست اعتمادًا إنتاجيًا لـ100,000 أو مليون مستخدم** قبل تنفيذ حمل مصادق عليه على PostgreSQL وRedis وSSE والبحث والمرفقات، وفصل الأعمال الثقيلة المتبقية إلى queues متخصصة عند إثبات الحاجة. لا توجد مبررات اختبارية حالية لإضافة sharding أو Kafka أو database rewrite.
