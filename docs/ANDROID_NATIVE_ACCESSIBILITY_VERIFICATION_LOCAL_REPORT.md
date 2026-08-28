# Android Native Accessibility Verification — Local Only

## نطاق الجولة

استُخدمت النسخة المحلية `Zephyx-Mail-archive-source-work-local.zip` فقط، دون GitHub أو ZIP قديم أو حسابات أو مزودات خارجية أو Secrets. فُك الأرشيف في مساحة عمل مؤقتة خارج Git، وشُغّلت أوامر Flutter داخل `mobile/novamail-flutter` في النسخة المفكوكة. لم يُعدّل منطق التطبيق أو Security Engine أو ClamAV أو MinIO أو RBAC أو العزل.

## سلامة الأرشيف

| الفحص | الحالة | النتيجة |
|---|---|---|
| `unzip -t` | **PASS** | لا أخطاء في الأرشيف |
| SHA-256 | **PASS** | `989a70d2fb5146bed3972c21ea66cb6229eedcab3671e4f90b1d06102cd10890` |
| الحجم | **PASS** | 6,474,862 بايت |
| مساحة العمل | **PASS** | `/tmp/zephyx-flutter-apk-build-20260827` |
| Flutter SDK داخل الأرشيف | **PASS** | غير موجود؛ بقي خارج المشروع |
| ملفات Git وbuild/cache داخل الأرشيف | **PASS** | غير موجودة |

## نتائج أوامر Flutter

شُغّلت الأوامر التالية من النسخة المفكوكة فقط:

```text
/tmp/zephyx-flutter-apk-build-20260827/mobile/novamail-flutter
```

| الأمر | الحالة | النتيجة |
|---|---|---|
| `flutter pub get` | **PASS** | اكتملت الاعتماديات |
| `flutter analyze` | **PASS** | لا توجد مشاكل تحليل |
| `flutter test` | **PASS** | 69/69 اختبارًا ناجحًا |
| `flutter build apk --debug` | **PASS** | تم إنشاء APK Debug فعلي |

فشل البناء الأول فقط لأن النسخة الأصلية داخل الأرشيف تستخدم Gradle 8.10.2، وهو أقل من الحد الأدنى الذي أبلغ عنه Flutter 3.47.1. عولج ذلك في مساحة العمل المؤقتة فقط برفع Gradle wrapper إلى 8.14.3 وAGP إلى 8.11.1، ثم نجح البناء. لم تُنقل هذه التعديلات إلى المستودع أو الأرشيف، ولم يتغير كود Dart أو منطق التطبيق.

## APK Debug

تم فحص APK خارج Git بعد البناء:

| الفحص | الحالة | النتيجة |
|---|---|---|
| وجود APK | **PASS** | `build/app/outputs/flutter-apk/app-debug.apk` |
| `unzip -t` | **PASS** | لا أخطاء في محتوى APK |
| Android package inspection | **PASS** | `com.novamail.app` |
| compile SDK | **PASS** | 36 |
| target SDK | **PASS** | 36 |
| الحجم | **PASS** | 169,341,322 بايت، نحو 161.5 MiB |
| SHA-256 | **PASS** | `10c79159b1906d401928b7064e7b49bd688dd36670df5ba7b1cd750aabf7a8d3` |
| إدخال APK إلى Git | **PASS** | لم يُدخل |

رابط التنزيل المباشر للـAPK:

[تحميل APK Debug — Zephyx Mail](https://files.manuscdn.com/user_upload_by_module/session_file/310519663865948636/DHugIbVXtVzkRzvr.apk)

هذا APK تجريبي Debug وليس إصدار Production موقّعًا للنشر. يجب التحقق من SHA-256 بعد التنزيل إذا كانت بيئة الهاتف أو التوزيع تتطلب ذلك.

## Android وadb والجهاز

لا يوجد هاتف Android أو جهاز USB متصل في هذه البيئة. لذلك لم تُشغّل `flutter run` على هاتف، ولم تُنفّذ أي عملية تثبيت أو نقل بيانات إلى جهاز. نتائج Android toolchain لا تعني وجود جهاز runtime.

| العنصر | الحالة |
|---|---|
| Android SDK | **PASS** — Platform 36 وBuild-tools 36.0.0 |
| adb tool | **PASS** كأداة، **BLOCKED / NOT RUN** كاتصال جهاز |
| Android device عبر USB | **BLOCKED / NOT RUN** — لا جهاز ظاهر |
| Android Emulator | **BLOCKED / NOT RUN** — لا يُستخدم بديلًا عن الهاتف |
| `flutter run` على الهاتف | **BLOCKED / NOT RUN** |
| `integration_test` | **NOT_CONFIGURED / NOT RUN** — غير متاح في النسخة الحالية |

## Accessibility والاختبار اليدوي

الاختبار اليدوي النهائي سيُجرى على هاتف المستخدم، لأن هذه البيئة لا تحتوي على هاتف Android أو جهاز USB متصل. لم تُعلن أي نتيجة PASS للاختبارات التي تتطلب جهازًا فعليًا.

| الاختبار اليدوي | الحالة |
|---|---|
| TalkBack وقراءة labels للأزرار والحقول | **BLOCKED / NOT RUN** |
| screen-reader announcements | **BLOCKED / NOT RUN** |
| رسائل loading/error/empty على الهاتف | **BLOCKED / NOT RUN** |
| focus traversal والتنقل بلوحة المفاتيح | **BLOCKED / NOT RUN** |
| تكبير النص 1.3x و2.0x | **BLOCKED / NOT RUN** |
| العربية RTL على الهاتف | **BLOCKED / NOT RUN** |
| الأردية RTL على الهاتف | **BLOCKED / NOT RUN** |
| Inbox وCompose وProductivity Dashboard على الهاتف | **BLOCKED / NOT RUN** |
| مقاس قريب من 390×844 | **BLOCKED / NOT RUN** |
| Widget/localization/RTL tests | **PASS** — 69/69؛ لا تستبدل اختبار الهاتف اليدوي |

## الملفات والمخرجات

لم يُحفظ APK أو build أو cache أو logs أو بيانات هاتف داخل المستودع. حُفظ APK للتنزيل خارج Git فقط، ويمكن حذفه بعد اكتمال تنزيل المستخدم. التقرير الحالي هو التغيير التوثيقي الوحيد المقصود في هذه الجولة داخل المستودع؛ بقيت جميع التغييرات المحلية السابقة محفوظة.

## Git والحالة النهائية

| العنصر | الحالة |
|---|---|
| الفرع | **PASS** — `archive-source-work` |
| HEAD | **PASS** — `4f0e82f2740638370794f42bbb64caad19733497` |
| Git status | بقيت التغييرات المحلية السابقة محفوظة؛ أضيف التقرير فقط في هذه الجولة |
| Reset | **لم يُنفذ** |
| `git add` | **لم يُنفذ** |
| Commit | **لم يُنفذ** |
| Push | **لم يُنفذ** |
| `main` وPR #8 | **لم يُلمسا** |

## التصنيف النهائي

**PASS:** سلامة الأرشيف، SHA-256، `flutter pub get`، `flutter analyze`، `flutter test` 69/69، `flutter build apk --debug` بعد إصلاح توافق مؤقت خارج Git، فحص APK، package inspection، وحساب SHA-256 والحجم.

**NOT_CONFIGURED:** `integration_test` غير متاح في النسخة الحالية. لا توجد بيانات هاتف أو API خارجي مستخدم.

**BLOCKED / NOT RUN:** `flutter run` على جهاز Android، adb device، TalkBack، screen-reader، focus traversal، text scaling، RTL runtime، Inbox/Compose/Productivity Dashboard على الهاتف، ومقاس 390×844 اليدوي.

**FAILED:** لا يوجد فشل وظيفي نهائي مثبت. فشل البناء الأولي كان توافقًا بيئيًا في مساحة العمل المؤقتة، ثم نجح البناء دون تعديل المستودع.

## مراجع محلية

[1]: ./FLUTTER_RUNTIME_CLOSURE_LOCAL_REPORT.md "Flutter Runtime Closure — Local Report"
[2]: ./ANDROID_NATIVE_ACCESSIBILITY_VERIFICATION_LOCAL_REPORT.md "Android Native Accessibility Verification — Local Report"
[3]: ./LOCAL_RELEASE_CANDIDATE_FREEZE_EVIDENCE_INDEX.md "Local Release Candidate Freeze & Evidence Index"
