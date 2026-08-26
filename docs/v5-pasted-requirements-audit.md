# v5 pasted_content requirements audit

## Constraints

- Work only on `feature/global-product-foundation-v5` and PR #4.
- Do not create a branch or PR, do not merge PR #4, do not force-push.
- Preserve v3/v4 tests and do not use `continue-on-error`.
- Report only behavior demonstrated by tests.

## Confirmed gaps from source audit

| Area | Confirmed gap | Required implementation |
|---|---|---|
| Flutter inbox | `TODO: wire up real email list from API`, `itemCount: 0`, hard-coded labels | Typed API/repository, cursor pagination, refresh, loading/empty/error/offline states, folder actions, translated UI |
| Flutter compose | Send callback empty | Send, draft save/update, scheduled send, draft-loss protection, translated UI |
| Flutter detail | Loading-only body and empty star/reply/delete callbacks | Fetch detail, star/read/trash/restore, reply/reply-all/forward |
| Flutter settings | Empty navigation callbacks | Working clear-cache/logout and translated UI |
| Refresh token | Mutex exists but no deterministic integration test and logout revoke flow | Tests for one refresh, replay, failed refresh, logout revoke |
| SSE auth | Native EventSource + Bearer-only middleware mismatch | One-time short-lived ticket endpoint and ticket-authenticated SSE |
| Web SSE events | Hook uses `onmessage` only | Named event listeners, malformed-event isolation, reconnect dedupe |
| Realtime scaling | In-process Maps/history/sequence | Redis Streams-backed durable bounded replay, global IDs, env limits, cross-replica tests |
| Notifications | Dev fallback key, token ownership by user+hash, no versioned envelope/lifecycle payload enforcement | Fail-closed production key, v1 envelope, global token ownership, rotation/revoke, preview-safe payload, provider contract tests |
| Flutter offline | In-memory mutation list | Encrypted persistent queue, restart recovery, TTL/max/dedupe/conflict handling, clear-cache and indicator |
| E2E | 17 localization/accessibility smoke tests only | Authenticated functional Playwright flows and protected-route accessibility |
| Localization | Key validation exists but Flutter screens use hard-coded text | Widget tests for all locales, RTL/CJK/long text/fallback/hard-code guard |
| Search | Backend has ILIKE body fallback and silently ignores invalid dates | Indexed search path, strict 400 validation, tie-safe cursor, Unicode/filter/integration tests |
| Gmail | Schema/controller exists | Upgrade/account isolation/single-account disconnect/sync-lock/PubSub account tests |

## Claims to avoid

- Do not claim real FCM, WebPush, ClamAV, Outlook, or external SMTP credentials were exercised.
- Do not claim iOS build success on Linux.
- Do not claim human translation review unless performed.

## Implementation order

1. Inspect exact backend contracts/schema and existing test commands.
2. Implement shared realtime/SSE/notification/search corrections first.
3. Implement Flutter typed client/repository/providers/screens and persistent offline storage.
4. Replace/add functional E2E and integration tests using fakes/test data.
5. Run local checks, scan secrets, commit, push to the same branch, and follow CI to success.

## Deferred-scope implementation checkpoint

The follow-up implementation now includes draft bootstrap/autosave, scheduled-send submission, reply context, authenticated attachment download/save/share, persistent Flutter dependency wiring, Settings locale coverage for all fifteen locale codes, and email-delivery notification fan-out through the configured Fake provider when notifications are enabled.

The following remain intentionally classified as deferred until dedicated real tests are added: full Reply All/Forward recipient/body prefill, a durable offline replay worker with server-side conflict reconciliation, authenticated Playwright register/login/mailbox flows, dedicated PostgreSQL Unicode/search/cursor fixture coverage, Gmail multi-account upgrade/account-lock/PubSub fixture coverage, a two-process Redis cross-replica SSE test, and fifteen-locale Flutter widget screenshot/overflow coverage. These are not represented as complete in the final report. Outlook remains `not_configured`; FCM, WebPush, ClamAV, Gmail OAuth, and external SMTP require credentials and are not exercised with real providers.
