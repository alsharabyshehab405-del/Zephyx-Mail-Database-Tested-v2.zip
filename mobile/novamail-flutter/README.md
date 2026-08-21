# NovaMail Flutter

Mobile client for NovaMail — built with Flutter for Android, iOS, and Web.

## Setup

### Prerequisites
- Flutter SDK >= 3.0.0
- Dart SDK >= 3.0.0
- Android Studio / Xcode for device builds

### Installation

```bash
cd mobile/novamail-flutter
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### Running

```bash
# Android
flutter run -d android --dart-define=API_BASE_URL=http://10.0.2.2:5000/api

# iOS
flutter run -d ios --dart-define=API_BASE_URL=http://localhost:5000/api

# Web
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5000/api
```

### Building for production

```bash
# Android APK
flutter build apk --release --dart-define=API_BASE_URL=https://your-api.com/api

# iOS
flutter build ios --release --dart-define=API_BASE_URL=https://your-api.com/api

# Web
flutter build web --dart-define=API_BASE_URL=https://your-api.com/api
```

## Project Structure

```
lib/
├── main.dart
├── core/
│   ├── network/     — Dio HTTP client with JWT auth + refresh
│   ├── router/      — GoRouter navigation
│   └── theme/       — App theme (light/dark, RTL support)
├── features/
│   ├── auth/        — Login, register, auth state
│   ├── inbox/       — Email list
│   ├── email_detail/ — Email reading
│   ├── compose/     — Compose new emails
│   └── settings/    — Theme, language, profile
├── shared/
│   └── screens/     — Splash, error screens
└── l10n/            — English + Arabic localizations
```

## Localisation (i18n)

Supports English and Arabic (RTL). Extend `lib/l10n/app_localizations.dart`
with ARB files to add more strings.
