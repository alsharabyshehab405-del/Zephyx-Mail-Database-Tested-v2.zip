# E2E Topology Recovery — Local Only

**المشروع:** Zephyx Mail
**المصدر الرسمي:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`
**الفرع:** `archive-source-work`
**HEAD:** `4f0e82f2740638370794f42bbb64caad19733497`
**النطاق:** استعادة طوبولوجيا E2E محلية فقط، باستخدام PostgreSQL وRedis وClamAV وMinIO محلية مؤقتة وبيانات صناعية، دون حسابات أو مزودات خارجية ودون Commit أو Push.

## الخلاصة

كان سبب النتيجة السابقة `16 PASS / 4 FAILED / 23 did not run` طوبولوجيًا لا خللًا مثبتًا في منطق API: إعداد Vite يعرّف proxy ثابتًا من `/api` إلى `http://127.0.0.1:3000`، بينما الجولة السابقة شغّلت API على منفذ مختلف، ولم يكن هناك backend متصل بالهدف الذي يستخدمه Vite. كما أن Playwright في وضع CI رفض Vite الذي بدأه harness مسبقًا لأن `reuseExistingServer` يصبح false في `CI=1`.

تم تشغيل API أولًا على المنفذ 3000، ثم Vite على 5173، والتحقق من `/api/health/ready` عبر Vite proxy قبل بدء Playwright. أُجريت functional E2E في بيئة ClamAV/MinIO محلية، ثم provider-state في بيئة ثانية أُعيد فيها تشغيل API دون إعدادات ClamAV/MinIO/SMTP. النتيجة الفريدة الكاملة أصبحت **41/41 functional PASS** و**2/2 provider-state PASS**؛ شغّل provider-state ثلاثة اختبارات لأن اختبار AI phishing العام مكرر داخل functional، ولذلك لا يُحسب مرتين.

لم يتغير منطق الإنتاج، ولم تُعدّل Vite config أو Playwright config أو Compose. ضُبطت rate limits في process البيئة الاختبارية فقط حتى لا تمنع التسجيلات الصناعية المتسلسلة، ولم تُرفع حدود الإنتاج.

## 1. Preflight

| البند | النتيجة |
|---|---|
| `origin` | **PASS** — `https://github.com/alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip.git` |
| الفرع | **PASS** — `archive-source-work` |
| HEAD المحلي | **PASS** — `4f0e82f2740638370794f42bbb64caad19733497` |
| remote-tracking | **PASS** — `0826683c54d943c00f117b8c05563b8bb9bb872a` |
| Reset أو ZIP بديل | **PASS** — لم يُنفذ Reset ولم تُستخدم نسخة بديلة |
| main وPR #8 | **PASS** — لم يُعدّل أي منهما |
| Flutter/Dart | **BLOCKED / NOT RUN** — SDK غير متوفر من Phase 6 |
| Docker/Compose | **PASS** — Docker وCompose v2 متاحان محليًا |

## 2. سبب الخلل السابق

### السبب الأول: proxy ثابت وAPI على منفذ غير مطابق

إعداد Vite في `artifacts/novamail-web/vite.config.ts` يوجه كل `/api` إلى `http://127.0.0.1:3000`. تشغيل API على 3010، كما حدث في قياسات Phase 7، لا يحقق هذا العقد؛ لذلك تصل واجهة Vite إلى هدف غير صحيح أو غير متصل.

### السبب الثاني: تعارض Vite مع `CI=1`

كان harness يبدأ Vite يدويًا ثم يشغل Playwright مع `CI=1`. إعداد `playwright.config.ts` يستخدم `reuseExistingServer: !process.env.CI`، ولذلك حاول Playwright بدء Vite آخر ورفض المنفذ 5173 المشغول. الحل المحلي كان تشغيل Playwright دون `CI=1` مع إبقاء Vite الذي بدأه harness، أو ترك Playwright نفسه يدير Vite، دون تعديل config.

### السبب الثالث: حدود تسجيل الاختبار

الـAPI يطبق `AUTH_RATE_LIMIT_MAX=20` افتراضيًا لكل نافذة. functional E2E تسجل مستخدمًا صناعيًا في اختبارات متعددة متسلسلة من نفس العنوان، فاستُنفدت الحصة. عولج ذلك في process الاختبار فقط باستخدام `AUTH_RATE_LIMIT_MAX=500`، و`AUTH_RATE_LIMIT_WINDOW_MS=600000`، مع حدود مماثلة لإجراءات البريد وكلمات المرور. لم يتغير default الإنتاج ولم تُخفَ اختبارات abuse.

### السبب الرابع: provider-state ليس هو functional provider setup

اختبارا Privacy Center وThreat Protection Settings يتوقعان `NOT_CONFIGURED` لـClamAV. أما functional attachment flow فيحتاج ClamAV وMinIO حقيقيين ويعرض `Configured/Connected`. لذلك فُصل الاختباران عمدًا، وأعيد تشغيل API في provider-state دون إعدادات ClamAV/MinIO/SMTP. هذا الفصل يمنع خلط حالتين صحيحتين بدل تعديل التطبيق أو إخفاء provider status.

## 3. أوامر التشغيل الصحيحة

استُخدمت قاعدة وRedis مؤقتان منفصلان، مع متغيرات اتصال في process فقط ودون طباعة القيم. الترتيب الصحيح كان:

```text
إنشاء PostgreSQL role/database صناعيين
تشغيل Redis على 127.0.0.1:16379
تشغيل MinIO محليًا على 19000 وإنشاء bucket صناعي
تشغيل ClamAV محليًا على 3310 وانتظار PING/PONG
تطبيق Prisma migrations على قاعدة الاختبار
بناء API
تشغيل API على 127.0.0.1:3000
التحقق من /api/health/ready
تشغيل Vite على 127.0.0.1:5173
التحقق من /api/health/ready عبر Vite proxy
تشغيل functional Playwright
إيقاف ClamAV وإعادة تشغيل API دون providers
تشغيل provider-state Playwright
تشغيل Integration وSecurity/AI وAPI Jest
تنظيف PIDs والحاويات والقواعد والمنافذ وartifacts
```

التحقق الحاسم كان أن الطلب التالي عبر Vite أعاد readiness ناجحة، لا مجرد أن Vite يعرض HTML:

```text
curl http://127.0.0.1:5173/api/health/ready
```

استُخدم `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`، مع استبعاد اختباري provider-state من functional عبر `--grep-invert`، ثم تشغيل الاختبارين في بيئة provider-state منفصلة عبر `--grep`. لم تُستخدم نسخة compatibility أو fake provider.

## 4. Playwright functional

| التصنيف | النتيجة |
|---|---|
| functional E2E الفريدة | **PASS — 41/41** |
| failed | **0** |
| did not run | **0** |
| proxy check | **PASS** |
| API readiness قبل Vite | **PASS** |
| Vite readiness | **PASS** |
| database migrations | **PASS** — 27 migration |
| ClamAV/MinIO attachment path | **PASS** ضمن functional |

شملت functional flows التسجيل وتسجيل الدخول والجلسات، Inbox والبحث والإجراءات، Compose والمرفقات، Workspace وProductivity، RTL والعربية والأردية، 15-language/Accessibility contracts، Security report confirmation boundary، وflows التي تحتاج ClamAV/MinIO محليين. الاختباران اللذان يتطلبان حالة provider غير مهيأة نُقلا إلى القسم التالي بدل اعتبارهـما skipped غير مفسرين.

## 5. Playwright provider-state

| الاختبار | النتيجة |
|---|---|
| AI phishing on-demand مع provider غير مهيأ | **PASS** — 1 اختبار، مكرر من functional لأغراض state verification |
| Privacy Center يعرض providers كـ`NOT_CONFIGURED` | **PASS** |
| Threat Protection Settings يعرض ClamAV/provider states كـ`NOT_CONFIGURED` | **PASS** |
| المجموع المنفذ | **PASS — 3 اختبارات** |
| الاختبارات الفريدة الجديدة خارج functional | **PASS — 2/2** |

لم تُشغّل provider-state مع ClamAV أو SMTP خارجي. لم تُخترع نتائج AI أو URL Intelligence، وبقيت الخدمات غير المهيأة صريحة في الواجهة.

## 6. الاختبارات المعاد تشغيلها

| المجموعة | النتيجة |
|---|---|
| Full Integration | **PASS — 30 ملفًا / 171 اختبارًا** |
| Security/AI Integration | **PASS — 6 ملفات / 21 اختبارًا** |
| API Jest | **PASS — suite واحدة / 3 اختبارات** |
| Prisma migration deploy | **PASS — 27 migration** |
| Secret scan بعد الجولة | **PASS — 1082 ملفًا متتبعًا** |
| `git diff --check` | **PASS** |

لا يوجد skipped أو failed في هذه المجموعات. جميع الاتصالات كانت إلى قواعد وخدمات محلية مؤقتة، ولم تُستخدم حسابات حقيقية أو مزودات خارجية.

## 7. الحالات المطلوبة

| المجال | الحالة | الملاحظة |
|---|---|---|
| API/Vite topology | **PASS** | API على 3000 قبل Vite، وproxy تحقق فعليًا |
| PostgreSQL/Redis | **PASS** | DB وRedis معزولان، readiness ناجحة |
| ClamAV المحلي | **PASS** في functional | حقيقي عبر INSTREAM؛ provider-state منفصل بلا إعداد |
| MinIO المحلي | **PASS** في functional | upload path اختُبر دون fake storage |
| AI Provider | **NOT_CONFIGURED** | لا credentials أو اتصال خارجي |
| URL Intelligence | **NOT_CONFIGURED** | لا credentials أو اتصال خارجي |
| External Attachment Sandbox | **NOT_CONFIGURED** | لا endpoint حقيقي |
| SMTP العام | **NOT_CONFIGURED** | لا Gmail/Outlook/SMTP خارجي |
| DNS/TLS/Monitoring العام | **NOT_CONFIGURED** | خارج sandbox |
| Flutter/Dart | **BLOCKED / NOT RUN** | SDK غير مثبت |
| Playwright | **PASS** | 41/41 functional فريدة + 2/2 provider-state فريدة |

## 8. التنظيف والحالة النهائية

استُخدمت PIDs محددة لخدمات API وWorker وVite، وأسماء حاويات محددة لـMinIO وClamAV. بعد الجولة لا توجد حاويات E2E، ولا قواعد أو أدوار PostgreSQL مؤقتة، ولا Redis على 16379، ولا API على 3000، ولا ClamAV على 3310، ولا MinIO على 19000/19001، ولا Vite على 5173. حُذفت `test-results` و`playwright-report` وملفات الاختبار المؤقتة.

بعد إنشاء هذا التقرير أصبحت شجرة العمل تحتوي **27 مسارًا محليًا**: 9 مسارات معدلة سابقة و18 مسارًا غير متتبع، وكلها موروثة من الجولات السابقة إضافة إلى هذا التقرير. لم تُحذف أو تُستعد أو تُعدّل المسارات المحلية السابقة، وبقي `docs/STAGING_CAPACITY_LOAD_REPORT.md` مستبعدًا عمدًا.

الحالة المثبتة في نهاية الجولة هي:

```text
branch: archive-source-work
HEAD: 4f0e82f2740638370794f42bbb64caad19733497
remote-tracking: 0826683c54d943c00f117b8c05563b8bb9bb872a
status: 27 local paths
working-tree check: git diff --check PASS
```

لم يُنفذ **Commit** أو **Push** أو **Reset**، ولم يُنشأ فرع أو PR، ولم يُعدّل `main` أو PR #8.

## مراجع محلية

- [Vite proxy](../artifacts/novamail-web/vite.config.ts)
- [Playwright config](../playwright.config.ts)
- [API health/readiness](../artifacts/api-server/src/routes/health.ts)
- [Rate-limit implementation](../artifacts/api-server/src/middlewares/rate-limit.ts)
- [Attachment security](../artifacts/api-server/src/lib/attachment-security.ts)
- [Attachment storage](../artifacts/api-server/src/lib/attachment-storage.ts)
