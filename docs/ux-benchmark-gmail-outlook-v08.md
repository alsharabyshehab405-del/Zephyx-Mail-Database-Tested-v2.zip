# Zephyx Mail — UX Benchmark v0.8

## الهدف

هذه مقارنة عملية بين السلوكيات الموثقة رسميًا في Gmail وOutlook وبين فرصة Zephyx Mail. لا تعني المقارنة أن أي تكامل خارجي مفعّل تلقائيًا؛ فالتوفر يعتمد على الحساب والترخيص وإعداد الخدمة.

## المقارنة

| المجال | Gmail | Outlook | نقطة تفوق Zephyx القابلة للاختبار |
|---|---|---|---|
| ترتيب الوارد | فئات وحالات وبحث، مع قدرات Gemini بحسب الحساب | Focused Inbox يقسم الرسائل إلى Focused وOther ويتعلم من التفاعل | ترتيب متعدد الأبعاد ومفسّر: unread/starred/primary/action/work، مع أسباب ظاهرة بدل صندوقين فقط |
| البحث | operators مثل `from:`, `to:`, subject، التاريخ، attachment، label، الحالة وBoolean | بحث عبر البريد وجهات الاتصال والمهام والتقويم والمرفقات مع operators وفلاتر | عبارة طبيعية تتحول إلى `queryPlan` وchips ظاهرة، مع بقاء البحث المتقدم وعزل الحساب |
| المهام والتقويم | Tasks مرتبطة بالتاريخ والتنبيهات وقائمة المهام والتقويم | To-Do Bar يجمع المواعيد والرسائل المعلّمة والمهام وQuick Steps | Workspace واحد يربط مصدر البريد بالـTask/Event ويحافظ على السياق والمنطقة الزمنية |
| AI | تلخيص، ردود مقترحة، صياغة، استخراج مهام ومواعيد بحسب Gemini | Copilot يدعم البحث وإنتاجية البريد والمهام والتقويم بحسب المنتج والترخيص | structured insights بحدود وثقة واضحة، وconfirmation قبل الكتابة، ولا إرسال أو إنشاء تلقائي |
| المتابعة | أدوات تذكير واقتراحات تختلف حسب الميزة والحساب | flags وdue dates وTo-Do Bar | follow-up lifecycle دائم مرتبط برسالة، قابل للإكمال والسكون، مع API واختبارات IDOR |
| الحسابات المتعددة | تبديل حسابات | تجارب موحدة للبريد والتقويم وجهات الاتصال | مساحة موحدة مع source/account chips وعزل صارم وحالة sync لكل حساب |
| العمل دون اتصال | يختلف حسب العميل والإعداد | يدعم نسخًا محلية ومسودات وإجراءات محددة مع قيود معلنة | offline mutations مشفرة ومستمرة، conflict reconciliation وexpectedVersion، مع إبقاء Send خارج replay الآمن |

## ما تم تنفيذه في v0.8+ بعد المقارنة

- صفحة `/workspace` حقيقية فوق API تعرض Smart Inbox وtasks وevents وdrafts وfollow-ups في مساحة واحدة.
- scoring مفسّر لكل رسالة مع أسباب قابلة للعرض، وليس ترتيبًا أسود الصندوق.
- natural-language query plan أولي يفسر `unread` و`starred` و`attachments` و`today` و`this week` و`from:` ويعرض الفلاتر قبل النتائج.
- follow-up persistence مع إنشاء وتحديث وإكمال وownership checks.
- AI insights endpoint يستعمل provider الحالي فقط؛ عند غيابه يعيد حالة عدم توفر واضحة، ولا يستخدم fallback يُقدّم كـAI.
- دعم 15 locale في namespace Workspace وRTL عبر `dir="auto"` والنصوص direction-aware.

## خارطة التفوق التالية

الخطوة التالية الموصى بها هي توسيع scoring إلى إعدادات يضبطها المستخدم، وإضافة job مجدولة لتذكيرات follow-up، ثم تحسين offline queue وربط إنشاء Task/Event بتأكيد المستخدم وسجل مصدر الرسالة. كل توسعة يجب أن تضيف API أو منطقًا دائمًا وحالات loading/error/empty/offline واختبارًا وظيفيًا قبل ظهورها في الواجهة.

## مصادر رسمية

1. [Google Support — Collaborate with Gemini in Gmail](https://support.google.com/mail/answer/14355636?hl=en&co=GENIE.Platform%3DDesktop)
2. [Google Workspace — Gemini in Gmail](https://workspace.google.com/products/gmail/ai/)
3. [Google Support — Refine searches in Gmail](https://support.google.com/mail/answer/7190?hl=en&co=GENIE.Platform%3DAndroid)
4. [Google Calendar Help — Create and manage tasks](https://support.google.com/calendar/answer/9901136?hl=en&co=GENIE.Platform%3DDesktop)
5. [Microsoft Support — Focused Inbox for Outlook](https://support.microsoft.com/en-us/outlook/mail/focused-inbox-for-outlook)
6. [Microsoft Support — How to work offline in Outlook for Windows](https://support.microsoft.com/en-us/outlook/getstarted/how-to-work-offline-in-outlook-for-windows)
7. [Microsoft Support — How to search in Outlook](https://support.microsoft.com/en-us/outlook/getstarted/how-to-search-in-outlook)
8. [Microsoft Support — Best practices for Outlook](https://support.microsoft.com/en-us/outlook/best-practices-for-outlook)
