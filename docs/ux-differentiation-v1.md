# Zephyx Mail — UX Differentiation v1

## Purpose

Zephyx Mail is a **mail-and-productivity workspace**, not a visual copy of Gmail or Outlook. Its differentiation must be observable in a real user flow, backed by a production API or deterministic local logic, and covered by functional tests. This document separates verified competitor capabilities, capabilities implemented in Zephyx, and work that must remain explicitly Foundation-only or Deferred until its complete production path exists.

The goal is not to claim that Zephyx is universally better. The goal is to make the product advantage concrete: less context switching, more explainable prioritization, safer automation, stronger ownership boundaries, and a first-class international and offline experience.

## Product promise

> **One accountable workspace for communication and next actions:** read the message, understand why it matters, convert it into a task or event, set a follow-up, and return to the same conversation without losing context.

## UX comparison

| Area | Gmail | Outlook | Zephyx v1 position | Evidence and boundary |
|---|---|---|---|---|
| Inbox organization | Gmail provides categories, labels, status filters, and account-dependent AI features. | Focused Inbox separates Focused and Other and can learn from user actions. | Smart Inbox exposes **Important, Needs follow-up, Work, Meetings, Deadlines, Personal, and Unread** as explicit sections. Each message shows a score and explainable signals such as unread, starred, primary, action/deadline, work, meeting, and personal context. | Implemented in the authenticated Inbox flow and backed by the Workspace productivity service. The ranking is deterministic and explainable; it is not claimed to be a trained ML classifier. |
| Email, tasks, and calendar | Google Tasks and Calendar are closely integrated but remain separate product surfaces. | Outlook links mail, To Do, and calendar through connected experiences and panes. | Workspace presents important mail, overdue tasks, upcoming meetings, drafts, replies-needed, and follow-ups in one route. Email-to-Task and Email-to-Event retain the source `emailId`. | Backed by `/api/productivity/workspace`, `/api/productivity/tasks`, and `/api/productivity/calendar/events`, with PostgreSQL persistence and ownership checks. |
| Message-to-action conversion | Competitor clients provide task/event integrations with product-specific dialogs and account requirements. | Outlook can convert mail context into tasks and appointments. | Zephyx keeps the user in the message context and offers **Create task, Create event, Follow-up reminder, Deadline, and Priority** controls with reviewable forms before writing. | The message-detail forms expose loading, error, success, and cancel states. AI suggestions never create a record without explicit confirmation. |
| Follow-up | Gmail supports reminders and filters, with account-dependent smart suggestions. | Outlook uses flags, categories, and due dates for follow-up workflows. | Follow-up is a durable, email-linked lifecycle with an explicit Center, **Snooze**, **Complete**, and **Open conversation** actions. | Implemented through PostgreSQL-backed follow-ups and HTTP ownership tests. Automatic completion after an incoming reply remains Deferred until a reconciliation job is shipped and tested. |
| Search | Gmail documents composable operators such as `from:`, `to:`, date, label, status, and attachment filters. | Outlook searches mail, contacts, tasks, calendar items, and attachments with operators and filters. | Zephyx provides one work-oriented search surface with visible filter controls for sender, date, attachment, priority, task, and folder, plus a deterministic natural-language query plan. | The parser is deliberately bounded and transparent. Arabic, Urdu, Unicode, CJK, emoji, invalid dates, cursor pagination, and tenant isolation are covered by API tests. It is not advertised as unrestricted natural-language search. |
| Compose | Gmail and Outlook provide mature recipient, draft, attachment, reply/forward, and scheduling flows. | The same capabilities vary by client, account, and tenant configuration. | Compose uses **To/Cc/Bcc chips**, keyboard commit/removal, validation, attachments, drafts, scheduling, and undo-send controls while preserving Reply, Reply all, and Forward context. | Functional tests verify chip validation, real draft persistence, scheduled payloads, quoted context, recipient exclusion, and attachment retention. |
| AI assistance | Gemini in Gmail can summarize, draft, retrieve information, suggest replies, and create tasks/events subject to account, license, and configuration. | Copilot capabilities vary by product, tenant, license, and configuration. | Zephyx exposes structured insights for summary, reply suggestion, task/date extraction, priority, and follow-up detection behind a provider contract. | With no provider, the API returns `503` and the UI shows `NOT_CONFIGURED`. Provider-backed success, malformed output, rate/error behavior, and explicit-write confirmation are acceptance requirements; no heuristic is presented as AI. |
| Multiple accounts | Gmail supports account switching and Google Workspace account contexts. | Outlook supports multiple accounts and unified mail/calendar/contacts experiences. | Zephyx preserves account and tenant ownership boundaries in the API and can expose per-account identity and sync state without mixing data. | Multi-account safety and routing are covered at the API layer. A complete unified multi-account Workspace UI remains Foundation-only until account switching, aggregation, and sync indicators are all implemented and tested together. |
| Offline-first | Gmail offline behavior depends on client and configuration. | Outlook documents offline mail actions with client-specific limitations. | Zephyx keeps safe offline mutations encrypted, version-aware, deduplicated, conflict-visible, and replayable while keeping Send outside the safe mutation queue. | The mobile foundation includes persistent replay semantics. A complete end-user offline Workspace UI and device-level validation remain a separate acceptance slice, not a marketing claim. |
| International UX | Gmail and Outlook offer broad localization and accessibility support with client-specific behavior. | Both offer localization, RTL behavior, keyboard access, and assistive technology support across supported clients. | Zephyx treats **15 locales, automatic RTL for Arabic and Urdu, Unicode/CJK-safe text, long strings, reduced motion, keyboard paths, focus states, and touch targets** as product behavior. | Web and Flutter locale contracts, RTL checks, accessibility scans, narrow-screen tests, and overflow tests are part of acceptance. |
| Privacy and control | Cloud processing, admin policy, and license behavior vary by edition and account. | The same applies to Microsoft account, tenant, and licensing configuration. | Zephyx makes provider availability explicit, keeps AI writes confirmation-bound, enforces ownership, avoids message-content/token logging, and marks unavailable integrations `NOT_CONFIGURED`. | This is an implementation policy, not a claim of absolute privacy or a claim that Gmail/Outlook are insecure. |

## Core user journeys

### 1. Prioritize and act on mail

1. The user opens Inbox and chooses a Smart Inbox section.
2. Zephyx renders the relevant messages with score and visible reasons.
3. The user can mark a message read, star it, archive it, or convert it into a Task from the row action bar.
4. Every mutation shows loading and success/error feedback and is scoped to the authenticated owner.

Primary paths: `GET /api/productivity/workspace`, `PATCH /api/emails/:id/read`, the existing star/archive endpoints, and `POST /api/productivity/tasks`.

### 2. Turn a conversation into a next action

1. The user opens a message and chooses Create task, Create event, Follow-up reminder, Deadline, or Priority.
2. Zephyx pre-fills the source context but requires the user to review and confirm the write.
3. The API persists the record with the source message relationship.
4. The UI shows loading, validation/error, success, and cancel states.

The message-detail implementation uses `emailId` ownership validation and PostgreSQL persistence. No AI suggestion can bypass the confirmation boundary.

### 3. Use AI without hidden writes

1. The user requests insights for a specific message.
2. The API authenticates the user and checks ownership before calling the provider.
3. A configured provider returns structured fields; an unavailable provider returns `NOT_CONFIGURED` through a clear `503` contract.
4. The user may copy or explicitly apply a suggestion; the system never sends mail or creates a task/event silently.

The success and unavailable behavior is covered by authenticated Playwright and API tests. Provider credentials are external configuration and are never committed.

### 4. Find work across mail

1. The user enters a natural-language phrase or opens the visible filter panel.
2. Zephyx shows the parsed query plan and lets the user edit sender/date/attachment/priority/task/folder filters.
3. The API applies the supported filter semantics to a user-scoped query.
4. Empty, invalid-date, loading, and error states remain visible; Unicode and RTL text are treated as data, not translated content.

## Implementation map

| Capability | Production path | Functional proof |
|---|---|---|
| Smart Inbox sections and quick actions | Web EmailList + productivity service | `tests/e2e/productivity-deep.spec.ts` Smart Inbox flow; API productivity tests |
| Unified Workspace Dashboard | Web `/workspace` + Flutter `/workspace` | `tests/e2e/productivity-deep.spec.ts`; `mobile/novamail-flutter/test/productivity_dashboard_widget_test.dart` |
| Task/Event conversion | Email Detail forms + productivity API | Dashboard/Email Detail Playwright flow; PostgreSQL HTTP integration tests |
| Follow-up Center | PostgreSQL follow-up lifecycle + Workspace UI | Follow-up E2E with snooze/complete and API ownership tests |
| AI insights | `POST /api/ai/insights/:emailId` | AI success/error/`NOT_CONFIGURED` API and Playwright tests |
| Search filters | Workspace parser and PostgreSQL query | Arabic/Urdu/CJK/emoji/filter/cursor/tenant-isolation integration tests |
| Compose chips and delivery | Compose modal + existing email API | `tests/e2e/productivity-deep.spec.ts` draft and scheduled-message flows; existing reply/forward payload tests |
| Preferences and layout | Workspace preferences API + persisted UI | Workspace preference HTTP integration tests and UI controls |
| RTL and accessibility | Web/Flutter direction and semantic controls | 15-locale E2E, axe serious/critical checks, Flutter narrow-screen/overflow tests |

## Acceptance contract

A feature is **Complete** only when it has a real user path, a production API or deterministic production logic, explicit loading/error/empty/offline states where applicable, an ownership or privacy boundary, functional tests, and short documentation. A screenshot is evidence of visual composition only; it is never sufficient functional proof.

| Feature | Required evidence before calling it Complete |
|---|---|
| Smart Inbox | Authenticated API response, visible deterministic reasons, persisted quick actions, loading/error/empty states, E2E, and ownership test. |
| Workspace | Real snapshot with all visible panels, persisted preferences, responsive Web and Flutter rendering, keyboard path, and screen-reader checks. |
| Email to Task/Event | Source `emailId` in request, PostgreSQL persistence, validation/error/success states, explicit confirmation, and IDOR rejection. |
| Follow-up | Durable lifecycle, snooze, complete, open-conversation action, due-state behavior, and tested reply reconciliation before automatic closure is claimed. |
| AI | Provider-backed success, malformed/error behavior, `NOT_CONFIGURED`, ownership, privacy-safe logging, and no automatic writes. |
| Search | Visible query plan, supported filter contract, invalid input handling, Unicode/RTL/CJK coverage, cursor behavior, and tenant isolation. |
| Compose | Chip validation, Reply/Reply all/Forward payloads, attachment behavior, draft persistence, scheduling, undo path, and loading/error feedback. |
| Offline-first mobile | Encrypted restart recovery, deduplication, expected-version conflict handling, permanent failure state, and an explicit non-queued Send path. |
| Customization and accessibility | Persisted settings, keyboard shortcuts, responsive layout, RTL behavior, reduced-motion behavior, axe checks, and Flutter overflow coverage. |

## Explicit non-claims and remaining work

The following must remain visible as **Foundation-only**, **Deferred**, or **NOT_CONFIGURED** until their complete path is delivered:

- AI provider-backed insights when no provider credential is configured.
- Gmail OAuth, FCM, Web Push, ClamAV, Billing, SMTP providers, and Outlook adapters when their external services are not configured.
- Automatic follow-up closure after a reply until a scheduled reconciliation job and race-safe tests exist.
- A full unified multi-account Workspace UI until account selection, aggregation, sync state, and isolation are covered end to end.
- Full mobile offline Workspace operation until device-level restart and conflict flows are proven in the target mobile clients.
- Unrestricted natural-language search or opaque ML priority classification; current behavior is intentionally bounded and explainable.

## Sources

[1] [Google Support — Collaborate with Gemini in Gmail](https://support.google.com/mail/answer/14355636?hl=en&co=GENIE.Platform%3DDesktop)

[2] [Google Workspace — Gemini in Gmail](https://workspace.google.com/products/gmail/ai/)

[3] [Google Support — Refine searches in Gmail](https://support.google.com/mail/answer/7190?hl=en&co=GENIE.Platform%3DAndroid)

[4] [Google Calendar Help — Create and manage tasks in Google Calendar](https://support.google.com/calendar/answer/9901136?hl=en&co=GENIE.Platform%3DDesktop)

[5] [Microsoft Support — Focused Inbox for Outlook](https://support.microsoft.com/en-us/outlook/mail/focused-inbox-for-outlook)

[6] [Microsoft Support — How to work offline in Outlook for Windows](https://support.microsoft.com/en-us/outlook/getstarted/how-to-work-offline-in-outlook-for-windows)

[7] [Microsoft Support — How to search in Outlook](https://support.microsoft.com/en-us/outlook/getstarted/how-to-search-in-outlook)

[8] [Microsoft Support — Best practices for Outlook](https://support.microsoft.com/en-us/outlook/best-practices-for-outlook)
