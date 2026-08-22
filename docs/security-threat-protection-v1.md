# Zephyx Mail Security Threat Protection v1

## النطاق

تضيف هذه النسخة طبقة حماية محلية قابلة للتدقيق للبريد والمرفقات والروابط. لا تُرسل عناوين الرسائل أو محتواها إلى مزود خارجي. لا تُستخدم نتائج تجريبية أو بيانات وهمية في Production؛ عند غياب تكامل خارجي يُعرض `NOT_CONFIGURED` ويُطبّق القرار الآمن المناسب.

## الحماية المنفذة

| التهديد | التنفيذ الفعلي | القرار والحالة |
|---|---|---|
| Malware attachments | فحص ClamAV عبر adapter حقيقي، مع magic bytes وامتدادات محظورة ومنع الأرشيفات الخطرة | `clean` فقط يسمح بالحفظ/التنزيل/المشاركة؛ غياب ClamAV أو verdict غير معروف fail-closed |
| Sender spoofing | تسجيل وتحليل `Authentication-Results` و`Return-Path` و`Reply-To` ومقارنة نطاق المرسل | SPF/DKIM/DMARC وspoofing risk تظهر مع أسباب قابلة للتفسير |
| Malicious links | تحليل محلي للرابط والنطاق، مع مؤشرات IP literal وpunycode وscheme غير آمن ونطاقات/مسارات مشبوهة | تحذير قبل الفتح؛ لا يفتح الرابط تلقائيًا |
| Spam | score حتمي قابل للتفسير مبني على إشارات العنوان والنص والمرفقات والروابط | الدرجة والأسباب محفوظة في PostgreSQL وتظهر للمستخدم |
| Reporting | `Report Spam` و`Report Phishing` عبر API محمي | فحص ownership، deduplication، وسجل تدقيق؛ لا يمكن الإبلاغ عن بريد مستخدم آخر |

## العقود والبيانات

تُحفظ نتائج التحليل وبلاغات المستخدم في جداول PostgreSQL عبر migration append-only، وتظهر في Email وEmailDetail وSettings عبر OpenAPI. لا يُسمح للمستخدم بإرسال verdict أمني جاهز؛ التحليل ينفذ في مسار الخادم أو ingestion الوارد، وتُعاد النتيجة العامة فقط.

## حالة التكاملات

| الخدمة | الحالة عند غياب الإعداد | متطلب التفعيل الحقيقي |
|---|---|---|
| ClamAV | `NOT_CONFIGURED`، ورفع/حفظ المرفق غير المفحوص مرفوض | daemon ClamAV متاح عبر socket أو `CLAMAV_HOST` و`CLAMAV_PORT` مع اختبار `INSTREAM` |
| AI provider | `NOT_CONFIGURED` | provider خاص بالتطبيق وcredential موافق عليه؛ لا يُستخدم مفتاح وكيل عام |
| Gmail OAuth | `NOT_CONFIGURED` | OAuth client وredirect URI وحساب Staging معزول |
| Outlook/Graph | `NOT_CONFIGURED` | Microsoft Graph app وscopes وحساب Staging |
| SMTP الخارجي | `NOT_CONFIGURED` إن لم يُضبط | SMTP اختبار خارجي مع TLS وsender policy |
| FCM/Web Push/Billing | `NOT_CONFIGURED` | credentials وendpoints خارجية مستقلة عن Production |

## الاختبارات

- اختبارات API/PostgreSQL تتحقق من تحليل Authentication-Results، حفظ threat metadata، ownership وIDOR isolation، deduplication، report spam/phishing، fail-closed، ورفض archive signatures.
- اختبارات Playwright authenticated تتحقق من بطاقة Threat Protection في Settings، الحالات الثماني `NOT_CONFIGURED`، report endpoint، ووجود قارئ البريد بعد report phishing.
- اختبارات Flutter تتحقق من parsing للإشارات القابلة للتفسير، ومنع تنزيل attachment غير المفحوص، والتحقق من report type قبل الشبكة.
- اختبارات Axe تغطي Settings والتدفقات الأمنية، كما يُفحص الهاتف وRTL ضمن suite العامة.

## الحدود المتبقية

التحليل المحلي ليس خدمة سمعة عالمية ولا بديلًا عن DNS/DMARC policy enforcement لدى مزود البريد. يجب تشغيل ClamAV فعليًا قبل قبول مرفقات Beta العامة، وضبط SPF/DKIM/DMARC على نطاق الإرسال، وتشغيل SMTP/TLS وDNS/HTTPS على Staging حقيقي. تبقى كل تكاملات AI وGmail وOutlook وFCM وWeb Push وBilling خارج نطاق التشغيل حتى تُجهز credentials بطريقة آمنة.
