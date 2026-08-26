# Global Localization v5

## Supported locales

The product ships reviewed application strings for `en`, `ar`, `es`, `fr`, `de`, `pt`, `it`, `tr`, `ru`, `zh-CN`, `ja`, `ko`, `hi`, `id`, and `ur`. English is the fallback locale. Arabic (`ar`) and Urdu (`ur`) automatically use RTL; direction is derived from locale metadata rather than a language-specific UI branch.

## Web loading model

Translations are split by feature namespace (`common`, `auth`, `email`, `inbox`, `settings`, `gmail`, `admin`, and related namespaces). English is eagerly available as the fallback; every non-English locale is loaded through Vite dynamic imports only when selected. The localization validator checks that each locale has exactly the English key set, no empty values, and matching ICU variable/plural placeholders.

## Flutter loading model

Flutter keeps one JSON asset per locale and loads the requested asset through `AppLocalizations.load`. Tokens remain in Flutter Secure Storage and are never placed in the localization or offline cache. The same BCP-47 locale codes are used by the account API, web, and mobile clients.

## ICU and formatting

Messages use ICU MessageFormat for variables and plural branches. Date, time, and number formatting use the selected locale and the device timezone. Email content, user names, subjects, and external provider data are not translated automatically; only product-owned interface strings are localized.

## Adding a language

To add a language, add its BCP-47 code to the central locale metadata, create the same namespace files under `artifacts/novamail-web/src/locales/<locale>/`, add the matching Flutter asset under `mobile/novamail-flutter/assets/l10n/`, and update the generated API enum through OpenAPI/codegen. Do not add conditional logic to components or services. Run `pnpm --dir artifacts/novamail-web run i18n:check`, the web typecheck, Flutter format/analyze/tests, and the pseudo-localization command. The CI check must pass before review.

Security and legal strings require human review. Automated translation may help create a draft for non-sensitive copy, but it must not be used as the final source for authentication, privacy, consent, legal, billing, or security messages.

## Visual verification

The pseudo locale expands characters and adds diacritics to expose truncation, overflow, mixed-script, and focus-order defects. Accessibility and Web E2E tests run the core login surface in all supported locales and explicitly check RTL for Arabic and Urdu. CJK content must use a font fallback available on the target platform; the product must not assume an Arabic-only font stack.
