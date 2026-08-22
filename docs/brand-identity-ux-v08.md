# Brand Identity & UX Polish v0.8

## Design direction

Zephyx Mail now uses a calm, high-contrast violet/cyan identity with a single mail mark, rounded control geometry, restrained elevation, and logical spacing that follows document direction. The visual language is intentionally quiet: the gradient is reserved for brand emphasis and primary actions, while message surfaces remain readable and neutral.

## Web implementation

The shared token layer lives in `artifacts/novamail-web/src/styles/brand-system.css` and is imported by `src/index.css`. It defines the brand palette, light/dark surface behavior, typography rhythm, control/card/panel radii, elevation, focus rings, reduced-motion behavior, responsive mobile adjustments, and compose/list/sidebar states. `BrandMark` is reused by the public landing page, authentication, sidebar, and mobile mail header. Navigation and Inbox filters use lazy-loaded `navigation` and `filters` namespaces for all 15 supported locales.

The high-traffic surfaces received concrete changes: Landing now has a branded hero treatment and feature cards; Login has a framed auth surface and branded hero; Sidebar follows the active document direction and translated labels; Inbox rows have stronger read/unread/starred hierarchy; filters are translated and labelled; Compose has branded header, field focus, attachment, toolbar, and action states; and favicon/theme metadata match the new identity.

## Flutter implementation

`mobile/novamail-flutter/lib/core/theme/app_theme.dart` is the mobile token source for light/dark colors, typography, input fields, cards, buttons, icon buttons, FAB, drawer, dividers, snackbar, and touch targets. `shared/widgets/brand_mark.dart` provides the reusable app mark. Inbox uses the new mark in AppBar and Drawer, gradient brand header, styled search, selected navigation, rounded message cards, and compact-screen-safe spacing.

## Verification assets

Before/After Landing screenshots are stored in `docs/design-screens/before-landing.webp` and `docs/design-screens/after-landing.webp`. Login After is stored in `docs/design-screens/after-login.webp`. The accompanying notes document the capture routes and visible deltas.

## Validation

The v0.8 changes were checked with Web typecheck, i18n contract validation, Web production build, Flutter format/analyze/tests, PostgreSQL/Redis integration suites, Worker reliability suites, and authenticated Playwright functional/accessibility tests. External services and credentials were not used.
