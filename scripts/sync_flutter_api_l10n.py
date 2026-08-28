import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "mobile" / "novamail-flutter" / "assets" / "l10n"
translations = {
    "en": {
        "backendNotConfigured": "Backend Not Configured. Set API_BASE_URL to a real HTTPS staging endpoint before signing in.",
        "loginFailed": "Login failed. Please try again.",
        "registrationFailed": "Registration failed. Please try again.",
    },
    "ar": {
        "backendNotConfigured": "الخادم غير مُهيأ. عيّن API_BASE_URL إلى نقطة Staging حقيقية عبر HTTPS قبل تسجيل الدخول.",
        "loginFailed": "فشل تسجيل الدخول. حاول مرة أخرى.",
        "registrationFailed": "فشل إنشاء الحساب. حاول مرة أخرى.",
    },
    "de": {
        "backendNotConfigured": "Backend nicht konfiguriert. Setzen Sie API_BASE_URL auf einen echten HTTPS-Staging-Endpunkt, bevor Sie sich anmelden.",
        "loginFailed": "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
        "registrationFailed": "Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.",
    },
    "es": {
        "backendNotConfigured": "Backend no configurado. Configure API_BASE_URL con un endpoint de staging HTTPS real antes de iniciar sesión.",
        "loginFailed": "No se pudo iniciar sesión. Inténtalo de nuevo.",
        "registrationFailed": "No se pudo crear la cuenta. Inténtalo de nuevo.",
    },
    "fr": {
        "backendNotConfigured": "Backend non configuré. Définissez API_BASE_URL vers un véritable endpoint de staging HTTPS avant de vous connecter.",
        "loginFailed": "Échec de la connexion. Veuillez réessayer.",
        "registrationFailed": "Échec de l'inscription. Veuillez réessayer.",
    },
    "hi": {
        "backendNotConfigured": "बैकएंड कॉन्फ़िगर नहीं है। साइन इन करने से पहले API_BASE_URL को वास्तविक HTTPS staging endpoint पर सेट करें।",
        "loginFailed": "साइन इन विफल हुआ। कृपया फिर से प्रयास करें।",
        "registrationFailed": "खाता बनाना विफल हुआ। कृपया फिर से प्रयास करें।",
    },
    "id": {
        "backendNotConfigured": "Backend belum dikonfigurasi. Atur API_BASE_URL ke endpoint staging HTTPS yang nyata sebelum masuk.",
        "loginFailed": "Gagal masuk. Silakan coba lagi.",
        "registrationFailed": "Gagal mendaftar. Silakan coba lagi.",
    },
    "it": {
        "backendNotConfigured": "Backend non configurato. Imposta API_BASE_URL su un endpoint di staging HTTPS reale prima di accedere.",
        "loginFailed": "Accesso non riuscito. Riprova.",
        "registrationFailed": "Registrazione non riuscita. Riprova.",
    },
    "ja": {
        "backendNotConfigured": "バックエンドが設定されていません。サインインする前に、API_BASE_URLを実際のHTTPSステージングエンドポイントに設定してください。",
        "loginFailed": "ログインに失敗しました。もう一度お試しください。",
        "registrationFailed": "アカウントの作成に失敗しました。もう一度お試しください。",
    },
    "ko": {
        "backendNotConfigured": "백엔드가 구성되지 않았습니다. 로그인하기 전에 API_BASE_URL을 실제 HTTPS 스테이징 엔드포인트로 설정하세요.",
        "loginFailed": "로그인하지 못했습니다. 다시 시도해 주세요.",
        "registrationFailed": "계정을 만들지 못했습니다. 다시 시도해 주세요.",
    },
    "pt": {
        "backendNotConfigured": "Backend não configurado. Defina API_BASE_URL para um endpoint de staging HTTPS real antes de iniciar sessão.",
        "loginFailed": "Não foi possível iniciar sessão. Tente novamente.",
        "registrationFailed": "Não foi possível criar a conta. Tente novamente.",
    },
    "ru": {
        "backendNotConfigured": "Сервер не настроен. Перед входом задайте API_BASE_URL для реальной HTTPS-точки staging.",
        "loginFailed": "Не удалось войти. Попробуйте ещё раз.",
        "registrationFailed": "Не удалось создать аккаунт. Попробуйте ещё раз.",
    },
    "tr": {
        "backendNotConfigured": "Arka uç yapılandırılmadı. Oturum açmadan önce API_BASE_URL değerini gerçek bir HTTPS hazırlık uç noktasına ayarlayın.",
        "loginFailed": "Giriş yapılamadı. Lütfen tekrar deneyin.",
        "registrationFailed": "Kayıt başarısız oldu. Lütfen tekrar deneyin.",
    },
    "ur": {
        "backendNotConfigured": "بیک اینڈ ترتیب نہیں دیا گیا۔ سائن اِن سے پہلے API_BASE_URL کو حقیقی HTTPS اسٹیجنگ اینڈ پوائنٹ پر سیٹ کریں۔",
        "loginFailed": "لاگ اِن ناکام ہو گیا۔ دوبارہ کوشش کریں۔",
        "registrationFailed": "اکاؤنٹ بنانا ناکام ہو گیا۔ دوبارہ کوشش کریں۔",
    },
    "zh-CN": {
        "backendNotConfigured": "后端未配置。请在登录前将 API_BASE_URL 设置为真实的 HTTPS 预发布端点。",
        "loginFailed": "登录失败，请重试。",
        "registrationFailed": "注册失败，请重试。",
    },
}

for locale, additions in translations.items():
    path = root / f"{locale}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(additions)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
