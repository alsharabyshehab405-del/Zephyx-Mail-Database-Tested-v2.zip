# Zephyx Mail v5 Known Limitations

This document records every remaining `TODO`, `FIXME`, and explicit `not implemented` marker found in the v5 source paths. The scan is intentionally limited to executable/source paths and excludes generated `dist` output, dependency trees, and source maps.

| Location | Classification | Decision | Reason and follow-up |
|---|---|---|---|
| `artifacts/api-server/.replit-artifact/artifact.toml:2` | Development preview metadata | Accepted non-runtime marker | This is Replit preview configuration, not API, web, Flutter, database, or v5 product behavior. It is retained because changing it would alter the hosting scaffold rather than product logic. |
| `artifacts/api-server/src/modules/gmail/provider-adapter.ts:18` | External provider boundary | Accepted explicit limitation | Microsoft Graph/Outlook is intentionally `not_configured` in v5. The interface remains provider-neutral; activation requires external OAuth credentials and provider review. No UI may represent it as an active integration. |

The v5 sweep found no additional `TODO` or `FIXME` markers in `artifacts/api-server/src`, `artifacts/novamail-web/src`, `mobile/novamail-flutter`, or `lib`. Generic HTML/CSS placeholder attributes are not implementation markers and are excluded from this policy scan.

## Remaining implementation boundaries

The following are documented product boundaries rather than silent callbacks: a real Gmail OAuth account requires external credentials; FCM, WebPush, ClamAV, and SMTP require external services; iOS platform tests require a macOS runner; and Android platform-channel tests may use an injectable adapter when an emulator is unavailable in Linux CI.

## CI policy

The repository guard checks the same source paths for new `TODO`, `FIXME`, or explicit `not implemented` markers. Any new marker fails CI unless its exact `path:line` is added to this document with a reason. Existing accepted markers remain visible and auditable.
