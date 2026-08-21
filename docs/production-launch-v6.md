# Production Launch & Global Readiness v6

هذا الدليل يصف مسار النشر الإنتاجي المقترح لـZephyx Mail. **لا توجد credentials أو مفاتيح داخل المستودع**؛ تُحقن القيم من GitHub Secrets أو Secret Manager عند النشر.

## بيئات التشغيل

| البيئة | PostgreSQL | Redis | External adapters | الاستخدام |
|---|---|---|---|---|
| Development | `docker-compose.yml` | Redis عادي محلي | Fake/disabled | التطوير المحلي |
| Staging | `docker-compose.staging.yml` | Redis منفصل بكلمة مرور | OAuth/SMTP اختبارية أو Fake | migration upgrade وsmoke/load tests |
| Production | `docker-compose.production.yml` أو خدمات مدارة | Redis TLS أو خدمة مدارة | لا يُفعّل إلا بعد اكتمال credentials/webhooks | مستخدمون حقيقيون |

## Production infrastructure

يستخدم `docker-compose.production.yml` شبكة backend داخلية، وCaddy كـreverse proxy على 80/443، وPostgreSQL وRedis مع healthchecks، وmigrate job منفصل، وAPI وWorker وScheduler وWeb services مستقلة. يجب توفير `APP_DOMAIN` و`ACME_EMAIL` و`REDIS_TLS_CERT_DIR` من مدير الأسرار أو من نظام النشر؛ لا تُحفظ الشهادات في Git.

يجب تشغيل API خلف proxy موثوق معلن عبر `TRUST_PROXY`، مع `ALLOWED_ORIGINS` HTTPS صريحة. لا يُفتح PostgreSQL أو Redis للعامة. يفضل استخدام PostgreSQL وRedis مداريين في الإنتاج مع TLS وbackup متعدد المناطق عندما تتطلب سياسة التوافر ذلك.

## Backup and restore

يُشغّل `scripts/backup-postgres.sh` عبر cron أو scheduler خارجي منخفض التواتر، ويكتب custom-format dumps إلى تخزين مشفر خارجي مع SHA-256 وretention. الاستعادة تتطلب `ALLOW_DATABASE_RESTORE=YES_I_HAVE_VERIFIED_THE_TARGET` عمدًا، وتستخدم `scripts/restore-postgres.sh`. يجب إجراء استعادة دورية إلى قاعدة معزولة عبر `scripts/verify-backup-restore.sh` قبل اعتماد النسخ.

لا يجوز اعتبار backup ناجحًا دون اختبار restore فعلي. يجب الاحتفاظ بنسخ منفصلة عن نفس منطقة قاعدة البيانات، ومراقبة عمر آخر backup وحجم dump ونتيجة checksum.

## Scaling and operations

يمكن تشغيل عدة API replicas خلف Caddy أو load balancer لأن الجلسات وrealtime tickets وqueue state مملوكة لـPostgreSQL/Redis. يجب تشغيل Worker replicas مع leases وconcurrency limits، وتشغيل Scheduler replicas مع advisory lock؛ لا تُستخدم state داخل الذاكرة كمرجع وحيد. يجب قياس queue lag وdead-letter و`delivery_unknown` ومعدل فشل SMTP/Gmail قبل التوسعة.

## External integrations

Gmail OAuth، SMTP provider، FCM، Web Push، ClamAV، وMicrosoft Graph لها adapters قابلة للتفعيل من البيئة. عند غياب credentials تفشل الخدمة بشكل آمن أو تبقى `not_configured` ولا تُطبع الأسرار. Fake adapters تبقى مخصصة للاختبارات ولا تمثل نجاح المزود الحقيقي. لا تُترجم أو تُسجّل tokens أو محتوى الرسائل.

## Security controls

Production يفرض secrets بطول وقوة كافيين، HTTPS للـbase URLs، allowlist لـCORS، trusted proxy صريح، CSP وHSTS وsecurity headers، request body limits، وrate limits. يجب تشغيل secret scanning وdependency audit وcontainer scanning وSBOM في CI قبل النشر. يجب مراجعة نتائج `npm audit` بعناية وعدم تحويل تحذير dependency إلى قبول تلقائي.

## Staging flow

1. أنشئ PostgreSQL وRedis منفصلين عن Production.
2. طبّق migration upgrade من snapshot v0.5.0 واختبر rollback على نسخة staging فقط.
3. استخدم OAuth وSMTP test credentials أو Fake adapters.
4. شغّل deployment smoke checks للـhealth/readiness، auth، Inbox، queue، SSE، وattachment scanner.
5. نفّذ load test محدودًا على API وSSE وWorker، ثم راجع p95 latency وerror rate وqueue lag.
6. لا ترفع staging credentials إلى المستودع أو إلى artifacts العامة.

## Rollback

أوقف rollout الجديد، أعد image digest السابق، وحافظ على migration rollback plan المكتوب لكل migration غير عكوسة. لا تُعدّل migration تاريخية. إذا كان schema الجديد backward-compatible، شغّل النسخة السابقة مؤقتًا ثم أصلح سبب التطبيق؛ وإلا استعد قاعدة staging أولًا وتحقق من backup قبل أي production action.

## Android وiOS

Android release signing يعتمد على secrets خارج Git، وملف `key.properties.example` يوضح الأسماء فقط. AAB وR8 يجب أن يُبنيا في runner مؤهل. iOS configuration موثق فقط عند غياب macOS runner؛ لا يُدّعى نجاح iOS build على Linux.

## Legal and compliance

الصفحات في `docs/legal/` قوالب تشغيلية تحتاج مراجعة قانونية قبل النشر. لا تمثل Privacy Policy أو Terms أو AUP نصيحة قانونية أو التزامًا نهائيًا. يجب ضبط retention للمرفقات والسجلات وتوثيق مكان تخزين البيانات بما يطابق البنية الفعلية.
