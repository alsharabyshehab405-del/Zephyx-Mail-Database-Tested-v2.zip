# تقرير تصحيح الهوية البصرية للموبايل — Zephyx Mail

## نطاق التنفيذ

نُفذت هذه الجولة على شجرة العمل المحلية الحالية فقط:

| البند | القيمة |
|---|---|
| مسار المستودع | `/home/ubuntu/zephyx-mail-github-official-archive-source-work` |
| الفرع | `archive-source-work` |
| HEAD المحلي | `4f0e82f2740638370794f42bbb64caad19733497` |
| المصدر المستخدم | الشجرة المحلية الحالية، دون استخدام ZIP بديل أو المصدر البعيد |
| طبيعة الجولة | Mobile Branding Correction + تحقق Flutter وAPK Debug |

لم تُنفذ أي عملية `reset` أو `git add` أو Commit أو Push، ولم يُنشأ فرع أو Pull Request، ولم تُعدّل `main` أو PR #8. بقيت التغييرات المحلية السابقة كما هي، بما فيها `docs/STAGING_CAPACITY_LOAD_REPORT.md`، ولم تُحذف أو تُستعد إلى نسخة أخرى.

## التغييرات المنفذة في هذه الجولة

| الملف | التغيير | الحالة |
|---|---|---|
| `mobile/novamail-flutter/lib/main.dart` | تغيير عنوان `MaterialApp.router` الظاهر إلى `Zephyx Mail` مع إبقاء class الداخلي `NovaMail` | PASS |
| `mobile/novamail-flutter/lib/features/auth/screens/login_screen.dart` | استبدال عنوان NovaMail الظاهر بـ `BrandMark` الموجود فعليًا، وإزالة import غير مستخدم كشفه `analyze` | PASS |
| `mobile/novamail-flutter/lib/features/auth/screens/register_screen.dart` | استبدال الشعار العام بـ `BrandMark`، وإزالة import غير مستخدم | PASS |
| `mobile/novamail-flutter/lib/shared/screens/splash_screen.dart` | استخدام `BrandMark` في Splash، وإزالة import غير مستخدم | PASS |
| `mobile/novamail-flutter/android/app/src/main/AndroidManifest.xml` | ضبط `android:label` إلى `Zephyx Mail` مع إبقاء أيقونة `@drawable/ic_zephyx_brand` | PASS |
| `mobile/novamail-flutter/ios/Runner/Info.plist` | ضبط `CFBundleDisplayName` و`CFBundleName` إلى `Zephyx Mail` | PASS |
| `mobile/novamail-flutter/pubspec.yaml` | تحديث الوصف فقط؛ بقي `name: novamail_flutter` | PASS |
| `mobile/novamail-flutter/README.md` | تحديث العنوان والوصف إلى Zephyx Mail دون تغيير اسم المجلد | PASS |
| `artifacts/novamail-web/.replit-artifact/artifact.toml` | تحديث العنوان metadata إلى `Zephyx Mail` مع إبقاء `id` الداخلي | PASS |

الشعار المستخدم هو الأصل الموجود مسبقًا في `mobile/novamail-flutter/android/app/src/main/res/drawable/ic_zephyx_brand.xml`، كما أن Widget `BrandMark` الموجود مسبقًا يعرض `Zephyx Mail`. لم تكن هناك قيمة `NovaMail` في ملف localization الفعلي `mobile/novamail-flutter/lib/l10n/app_localizations.dart`، لذلك لم تُجرَ تعديلات ترجمة بلا دليل.

## إصلاح توافق البناء

فشل أول بناء مباشر قبل إصلاح التوافق لأن Flutter 3.47.1 رفض Gradle 8.10.2، ثم كان سيحتاج AGP أحدث من 8.7.0. طُبق الحد الأدنى المثبت داخل المستودع الحالي فقط:

| الملف | التغيير | الغرض |
|---|---|---|
| `mobile/novamail-flutter/android/gradle/wrapper/gradle-wrapper.properties` | Gradle `8.10.2` إلى `8.14.3` | تمكين Flutter 3.47.1 من متابعة البناء |
| `mobile/novamail-flutter/android/settings.gradle.kts` | AGP `8.7.0` إلى `8.11.1` | تلبية حد Flutter بعد تحديث wrapper |

هذا إصلاح توافق build وليس تغييرًا في منطق التطبيق أو الهوية أو Security Engine. لم يُستخدم `--android-skip-build-dependency-validation`. بقي Kotlin على `2.2.20` كما هو.

## حواجز الهوية والعقود

| الحاجز | النتيجة | الدليل |
|---|---|---|
| Android namespace | PASS | `com.novamail.app` |
| Android applicationId / package ID | PASS | `com.novamail.app` |
| Android launcher label | PASS | `Zephyx Mail` |
| Android launcher icon | PASS | `@drawable/ic_zephyx_brand` |
| iOS Bundle Identifier | PASS | `com.novamail.app` |
| Flutter/Dart package name | PASS | `novamail_flutter` |
| مجلد Flutter | PASS | `mobile/novamail-flutter` دون إعادة تسمية |
| API routes، قاعدة البيانات، auth، Security Engine، ClamAV، MinIO، RBAC | PASS ضمن نطاق هذه الجولة | لم تُعدّلها تغييرات Branding |
| النصوص المرئية القديمة | PASS | لم يبقَ تطابق مرئي مؤهل لـ NovaMail/Nova Mail بعد استبعاد class/package/import/CSS/comments/paths الداخلية |
| localization | PASS | 15 locale محفوظة؛ لم يوجد الاسم القديم في localization الفعلي |

بقاء `NovaMail` في class داخلي أو أسماء package/import/CSS/path ليس نصًا ظاهرًا للمستخدم، وتغييره كان سيخالف حارس الهوية المطلوب.

## نتائج Flutter النهائية

شُغلت الأوامر من `mobile/novamail-flutter` باستخدام Flutter SDK الخارجي الرسمي الموجود خارج المستودع (`Flutter 3.47.1`, `Dart 3.13.1`) وبعدها نُظفت المخرجات المولدة من الشجرة:

| الفحص | النتيجة | التفاصيل |
|---|---|---|
| `flutter pub get` | PASS | exit code `0` |
| `flutter analyze` | PASS | exit code `0`؛ `No issues found!` بعد إزالة ثلاثة imports غير مستخدمة |
| `flutter test` | PASS | exit code `0`؛ `69` اختبارًا ناجحًا، `All tests passed!` |
| `flutter build apk --debug` | PASS | exit code `0` من المشروع الفعلي بعد إصلاح Gradle/AGP |
| `git diff --check` | PASS | لا أخطاء whitespace |
| `pnpm run security:secrets` | PASS | Secret scan مرّ على `1082` ملفًا متتبعًا دون كشف أسرار |

## APK Debug الناتج

تم إبقاء APK خارج Git وبصلاحية محلية `0600` في `/home/ubuntu/Zephyx-Mail-local-debug-branding.apk`، ثم رُفع للحصول على رابط تنزيل جديد.

| التحقق | النتيجة |
|---|---|
| `unzip -t` | PASS — لا أخطاء في الأرشيف |
| `aapt2 dump badging` — package | `com.novamail.app` |
| `aapt2 dump badging` — application label | `Zephyx Mail` |
| `aapt2 dump badging` — icon | `res/drawable/ic_zephyx_brand.xml` |
| compile SDK | `36` |
| target SDK | `36` |
| الحجم | `169,341,054` bytes |
| SHA-256 | `c154acb12efb2c5ec8fdaf6fd23dee4f34e97daffa0790db1fe23eb112d5baaf` |
| رابط التنزيل | [تحميل APK Debug — Zephyx Mail](https://files.manuscdn.com/user_upload_by_module/session_file/310519663865948636/psCfHPIrrLNfmieT.apk) |

الرابط أعلاه يخص APK الناتج من **البناء المباشر الأخير للمشروع الفعلي**، وليس APK Branding القديم أو أي APK سابق.

## الحالات غير المنفذة والقيود

| المجال | الحالة | السبب |
|---|---|---|
| Android runtime الفعلي | BLOCKED / NOT RUN | لا يوجد هاتف USB، ولا AVD قابل للإقلاع، وغياب KVM؛ لم تُستخدم محاكاة أو نتيجة بديلة |
| TalkBack وscreen-reader announcements | BLOCKED / NOT RUN | تتطلب جهازًا أو Emulator فعليًا |
| focus traversal على Android | BLOCKED / NOT RUN | لا يوجد جهاز/Emulator فعلي متاح |
| text scaling عند 1.3x و2.0x ونافذة قريبة من 390×844 | BLOCKED / NOT RUN | لم تتوفر بيئة runtime فعلية |
| Android RTL runtime للعربية والأردية | BLOCKED / NOT RUN | لم تتوفر بيئة runtime فعلية؛ ملفات/اختبارات Flutter النصية لم تُعتبر بديلًا عن الاختبار اليدوي |
| `integration_test` | NOT_CONFIGURED | لا يوجد تكامل runtime فعلي مُهيأ لهذه الجولة |
| AI Provider | NOT_CONFIGURED | لا credentials ولا اتصال خارجي |
| URL Intelligence Provider | NOT_CONFIGURED | لا credentials ولا اتصال خارجي |
| Attachment Sandbox الخارجي | NOT_CONFIGURED | لم يُستخدم أي مزود خارجي |
| SMTP وDNS/TLS وMonitoring العام | NOT_CONFIGURED | خارج البيئة المحلية ولم تُنشأ حسابات أو أسرار |

لم تُستخدم بيانات حقيقية، ولم تُرسل رسائل أو مرفقات لأي مزود، ولم تُستخدم Fake AI أو Fake Scanner.

## التحذيرات غير الحاجبة

ظهرت أثناء `pub get` حزم أحدث غير متوافقة مع القيود الحالية، وعددها `57` حزمة. كما ظهرت تحذيرات مستقبلية بأن Flutter سيسقط دعم Gradle `8.14.3` وAGP `8.11.1` وKotlin `2.2.20` في إصدارات لاحقة، إضافة إلى تحذير SDK XML وتحذيرات source/target Java 8. لم تمنع هذه التحذيرات البناء الحالي، ولم تُستخدم لتغيير Kotlin أو أي منطق أمني.

## تنظيف مخرجات الجولة

بعد نسخ APK ورفعه، أزيلت فقط مخرجات Flutter المولدة من الشجرة الحالية: `build` و`.dart_tool` و`coverage` و`android/.gradle` و`android/local.properties` و`ios/Flutter` وGeneratedPluginRegistrant غير المتتبعة. كما أُعيدت الملفات المولدة المتتبعة التي أنشأتها Flutter إلى حالتها المحلية السابقة باستخدام استعادة worktree انتقائية؛ لم يُستخدم `git reset` ولم تُمس التغييرات السابقة غير المولدة.

## الحالة النهائية

| البند | الحالة |
|---|---|
| Branding المستخدم الظاهر | PASS |
| Android label داخل APK | PASS |
| package ID guard | PASS |
| Flutter pub/analyze/test | PASS |
| APK build/ZIP/badging/hash | PASS |
| Android accessibility runtime | BLOCKED / NOT RUN |
| الخدمات الخارجية | NOT_CONFIGURED |
| حالة Git | `42` مسارًا محليًا غير ملتزم؛ تغييرات سابقة + Branding/Gradle والتقرير، دون staging أو commit |
| Commit / Push / Reset | لم تُنفذ |

حالة Git ليست clean: في اللقطة النهائية يوجد `42` مسارًا محليًا غير ملتزم، منها تغييرات سابقة وتقارير غير متتبعة وتغييرات Branding/Gradle والتقرير الحالي. لم تُحذف أو تُستعد هذه الملفات، بما فيها التقارير التاريخية والملفات المستبعدة عمدًا. مرّ `git diff --check` وSecret scan، ولم تبقَ مخرجات Flutter المولدة داخل الشجرة.
