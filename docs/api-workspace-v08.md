# Workspace Productivity API v0.8

كل المسارات التالية تحت `/api` وتتطلب `Authorization: Bearer <access-token>`. لا تُرجع الرسائل أو المهام إلا إذا كانت مملوكة للمستخدم الحالي.

| المسار | الوظيفة | النجاح | حالات مهمة |
|---|---|---|---|
| `GET /productivity/workspace?q=` | لقطة موحدة للـSmart Inbox والمهام والاجتماعات والمسودات والمتابعات | `200` مع `queryPlan`, `smartInbox`, `overdueTasks`, `upcomingEvents`, `drafts`, `followUps` | `401` عند غياب المصادقة |
| `GET /productivity/smart-inbox?q=` | ترتيب رسائل Inbox مع `score` و`reasons` | `200` | `401` |
| `GET /productivity/follow-ups` | قائمة المتابعات المفتوحة/المؤجلة | `200` | `401` |
| `POST /productivity/follow-ups` | إنشاء أو تحديث تذكير رسالة | `201` | `400` لتاريخ غير صالح، `404` لرسالة مستخدم آخر |
| `PATCH /productivity/follow-ups/:id` | إكمال/تأجيل/تعديل المتابعة | `200` | `404` عند IDOR أو عدم الوجود |
| `POST /productivity/tasks` | إنشاء Task مرتبط اختياريًا برسالة مملوكة | `201` | `400` لمدخلات غير صالحة، `404` لرسالة غير مملوكة |
| `POST /productivity/calendar/events` | إنشاء Event مرتبط اختياريًا برسالة مملوكة | `201` | `400` لفترة زمنية غير صالحة، `404` لرسالة غير مملوكة |
| `POST /ai/insights/:emailId` | استخراج summary/reply/tasks/events/priority/follow-up عبر provider AI الحقيقي | `200` عند تهيئة provider | `404` لعزل المستخدم، `503` عندما يكون provider `NOT_CONFIGURED`, `502` عند استجابة provider غير صالحة |

## ضمانات السلوك

`queryPlan` يوضح للمستخدم الفلاتر التي فُسرت من العبارة الطبيعية. الترتيب الحالي explainable ومبني على unread وstarred وprimary وإشارات الإجراء وسياق العمل؛ لا يُقدّم heuristic على أنه AI. أي كتابة Task/Event أو إرسال رد مقترح تحتاج تأكيد المستخدم، وendpoint AI لا ينفذ أي write.

تحتفظ follow-ups بعلاقة دائمة مع المستخدم والرسالة، وتمنع IDOR عبر شرط الملكية في كل استعلام. عند عدم وجود provider AI لا تُنشأ نتيجة وهمية؛ تعرض الواجهة حالة عدم التهيئة ويمكن تفعيل provider لاحقًا دون تغيير عقد الواجهة.
