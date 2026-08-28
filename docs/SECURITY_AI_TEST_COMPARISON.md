# مقارنة نتائج Security/AI

**المشروع:** Zephyx Mail
**المستودع:** `alsharabyshehab405-del/Zephyx-Mail-Database-Tested-v2.zip`
**الفرع:** `archive-source-work`
**HEAD:** `0826683c54d943c00f117b8c05563b8bb9bb872a`
**الغرض:** توثيق سبب اختلاف عدادات جولتي Security/AI دون تغيير منطق التطبيق أو تشغيل مزود خارجي.

## الخلاصة

كلتا الجولتين نجحتا دون اختبارات فاشلة. الاختلاف ناتج عن **اختلاف مجموعة ملفات الاختبار المشغلة**، وليس عن فقدان اختبار أو إخفاء فشل. الجولة السابقة شغلت أربعة ملفات بإجمالي 21 اختبارًا، بينما الجولة الحالية شغلت ملفين بإجمالي 20 اختبارًا. الملف المشترك بين الجولتين هو `ai-phishing.integration.test.ts` وفيه 9 اختبارات. الجولة السابقة أضافت ثلاثة ملفات عقود خاصة بـEnterprise وURL Intelligence وAttachment Sandbox بإجمالي 12 اختبارًا، أما الجولة الحالية فاستبدلتها بملف `security-reliability.test.ts` وفيه 11 اختبارًا. لذلك أصبح العدد الحسابي `4 files / 21 tests` مقابل `2 files / 20 tests`.

> لا توجد دلالة على تراجع وظيفي من هذه الأرقام وحدها؛ إنهما run sets مختلفان. وللمقارنة الشاملة يجب قراءة Full Integration المنفصل، الذي شغّل 26 ملفًا و164 اختبارًا في الجولة الأخيرة.

## الجولة السابقة: 4 files / 21 tests PASS

**سجل التنفيذ:** `2026-08-26_19-21-18_46774_7226.txt`، باستخدام الاختبار الأمني المركز المحفوظ في سجل الجولة السابقة.

| ملف الاختبار | عدد الاختبارات |
|---|---:|
| `src/modules/security/ai-phishing.integration.test.ts` | 9 |
| `src/modules/enterprise/enterprise.foundation.test.ts` | 6 |
| `src/modules/security/url-intelligence-provider.test.ts` | 3 |
| `src/lib/attachment-sandbox.test.ts` | 3 |
| **الإجمالي** | **4 / 21 PASS** |

### أسماء الاختبارات السابقة

#### `ai-phishing.integration.test.ts` — 9

1. returns and stores an explicit NOT_CONFIGURED result without contacting an AI provider
2. requires owner/admin consent to change organization AI phishing state
3. enforces user and organization isolation for stored analysis
4. handles Microsoft impersonation, suspicious login links, domain mismatch, and clean mail without allowing AI to lower local risk
5. exposes unified engine and explicit NOT_CONFIGURED URL intelligence without external facts
6. requires organization consent before calling URL Intelligence and merges real provider findings
7. stores feedback in user and organization scope and prevents outsider access
8. keeps dashboard and assistant data organization-scoped and reports missing provider honestly
9. returns 503 on provider failure and does not log message content

#### `enterprise.foundation.test.ts` — 6

1. enforces organization role boundaries
2. keeps the append-only migration scoped to organization-owned records
3. finds Enterprise tables in PostgreSQL after migration
4. isolates a real organization workflow in PostgreSQL
5. does not expose API key hashes through the service contract
6. declares ownership checks as a real service boundary

#### `url-intelligence-provider.test.ts` — 3

1. is NOT_CONFIGURED without a complete provider
2. rejects non-HTTPS external endpoints
3. parses bounded structured findings without sending attachments

#### `attachment-sandbox.test.ts` — 3

1. remains NOT_CONFIGURED without a real provider
2. does not enable a sandbox outside staging
3. accepts only a complete staging endpoint

## الجولة الحالية: 2 files / 20 tests PASS

**سجل التنفيذ:** `2026-08-26_21-20-41_712141_7226.txt`، بأمر تشغيل صريح لملفي Security/AI التاليين.

| ملف الاختبار | عدد الاختبارات |
|---|---:|
| `src/modules/security/ai-phishing.integration.test.ts` | 9 |
| `src/lib/security-reliability.test.ts` | 11 |
| **الإجمالي** | **2 / 20 PASS** |

### أسماء الاختبارات الحالية

#### `ai-phishing.integration.test.ts` — 9

1. returns and stores an explicit NOT_CONFIGURED result without contacting an AI provider
2. requires owner/admin consent to change organization AI phishing state
3. enforces user and organization isolation for stored analysis
4. handles Microsoft impersonation, suspicious login links, domain mismatch, and clean mail without allowing AI to lower local risk
5. exposes unified engine and explicit NOT_CONFIGURED URL intelligence without external facts
6. requires organization consent before calling URL Intelligence and merges real provider findings
7. stores feedback in user and organization scope and prevents outsider access
8. keeps dashboard and assistant data organization-scoped and reports missing provider honestly
9. returns 503 on provider failure and does not log message content

#### `security-reliability.test.ts` — 11

1. detects magic bytes instead of trusting MIME
2. validates Office Open XML structure and rejects fake ZIP markers
3. rejects executable and traversal filenames
4. namespaces object keys by environment, organization, user, and attachment
5. rejects weak production secrets
6. redacts sensitive audit metadata without throwing
7. validates SMTP timeout relationship and derives a lease margin
8. validates Worker hard shutdown timeout after graceful shutdown timeout
9. rejects invalid SMTP timeout bounds
10. requires feature keys only when the feature is enabled
11. uses a versioned encrypted notification token envelope and never returns the raw token

## مطابقة الفروقات

| العنصر | الجولة السابقة | الجولة الحالية | الفرق |
|---|---:|---:|---:|
| عدد ملفات الاختبار | 4 | 2 | `-2` |
| عدد الاختبارات | 21 | 20 | `-1` |
| الاختبارات المشتركة | 9 | 9 | لا تغيير |
| ملفات Enterprise/URL/Sandbox | 3 ملفات / 12 اختبارًا | غير مشغلة في هذا run set | استُبعدت من الأمر الحالي، لا فشل |
| `security-reliability.test.ts` | غير مشغّل في هذا run set | 11 اختبارًا | أضيف إلى الأمر الحالي |
| اختبارات فاشلة | 0 | 0 | لا فشل |

## القرار

النتيجة الحالية الصحيحة لهذا الأمر المحدد هي **2 files / 20 tests PASS**. النتيجة السابقة الصحيحة لأمر الجولة السابقة هي **4 files / 21 tests PASS**. لا يجوز دمج الرقمين في عداد واحد أو اعتبار الفرق regression. تم تحديث تقارير الجاهزية لتوضح run set كل جولة، وتبقى المزودات الخارجية AI وURL Intelligence وAttachment Sandbox في حالة `NOT_CONFIGURED`.

## المراجع المحلية

[1]: ../artifacts/api-server/src/modules/security/ai-phishing.integration.test.ts "AI phishing integration tests"
[2]: ../artifacts/api-server/src/modules/enterprise/enterprise.foundation.test.ts "Enterprise foundation tests"
[3]: ../artifacts/api-server/src/modules/security/url-intelligence-provider.test.ts "URL intelligence provider tests"
[4]: ../artifacts/api-server/src/lib/attachment-sandbox.test.ts "Attachment sandbox tests"
[5]: ../artifacts/api-server/src/lib/security-reliability.test.ts "Security reliability tests"
[6]: ../artifacts/api-server/src/modules/security/security-engine.service.ts "Unified Security Engine"
