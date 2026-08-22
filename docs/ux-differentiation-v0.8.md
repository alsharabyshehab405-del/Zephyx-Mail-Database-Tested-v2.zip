# Zephyx Mail — UX Differentiation v0.8

## Purpose

This document defines the product-level differences Zephyx Mail should deliver instead of copying Gmail or Outlook. It separates **verified competitor capabilities**, **implemented Zephyx capabilities on this branch**, and **future work that must not be represented as complete until it has a production path, observable states, tests, and documentation**.

The goal is not to claim that Zephyx is universally better. The goal is to make its advantages concrete, measurable, privacy-aware, and testable.

## Comparison

| Area | Gmail | Outlook | Zephyx position and measurable advantage |
|---|---|---|---|
| Inbox organization | Gmail supports categories, status filters, labels, and documented AI Inbox capabilities. | Focused Inbox separates Focused and Other and can learn from user actions. | Zephyx uses an explainable productivity view with visible signals such as unread, starred, primary, action, and work context. The user can see why a message is ranked instead of receiving an unexplained importance label. |
| Email, tasks, and calendar | Google Tasks and Calendar are tightly integrated but remain distinct product surfaces. | Outlook provides a To-Do Bar and connected mail/calendar/task workflows. | Zephyx provides a single Workspace route with linked Smart Inbox, overdue tasks, upcoming meetings, drafts, and follow-ups. Email-to-task and email-to-event retain the originating message ID. |
| Follow-up | Gmail supports filters, reminders, and AI-suggested to-dos depending on account capabilities. | Outlook supports flags, categories, due dates, and follow-up-oriented task views. | Zephyx treats follow-up as a durable email-linked lifecycle with API ownership checks, visible reminder controls, snooze, and completion. Automatic reply-based resolution still requires a scheduled delivery/reconciliation job and must not be claimed as complete before that job is shipped and tested. |
| Search | Gmail documents composable operators such as `from:`, `to:`, subject, dates, labels, status, attachments, and Boolean expressions. | Outlook searches mail, contacts, tasks, calendar items, and attachments and offers operators and filters. | Zephyx exposes one natural-language entry point that produces a visible deterministic query plan and filter chips. The current implementation supports a bounded parser for sender/date/attachment/priority/task/folder semantics; it is not an unrestricted natural-language search engine. |
| AI assistance | Gemini in Gmail can provide summaries, suggested replies, drafting, information retrieval, event creation, and suggested to-dos subject to account and license availability. | Copilot capabilities vary by product, tenant, license, and configuration. | Zephyx separates summary, reply suggestion, task/date extraction, priority, and follow-up signals behind a structured provider contract. AI never sends or writes silently. With no configured provider the API returns `503` and the UI displays `NOT_CONFIGURED`; tests use a fake provider, not fabricated production results. |
| Multiple accounts | Gmail supports account switching and Google Workspace account contexts. | Outlook supports multiple accounts and unified mail/calendar/contacts experiences. | Zephyx can extend the Workspace model with account-scoped identity badges and per-account sync state while preserving strict ownership boundaries. Multi-account UX is a product requirement, not a claim that every account provider is enabled in this branch. |
| Offline behavior | Gmail offline behavior depends on client and configuration. | New Outlook documents offline copies, drafts, replies/forwards, search, folder actions, flags, snooze, and queued sends with limitations. | Zephyx keeps safe offline mutations durable, encrypted, idempotent, version-aware, and conflict-visible. Send must remain outside the safe replay queue unless a separate delivery protocol proves its semantics. |
| RTL, languages, and accessibility | Gmail and Outlook offer broad localization and accessibility support with client-specific behavior. | Outlook offers broad localization and accessibility support across clients. | Zephyx maintains fifteen locales, automatic RTL for Arabic and Urdu, Unicode/CJK-safe content, keyboard paths, focus states, reduced motion, screen-reader labels, and tested narrow layouts as product contracts rather than optional themes. |
| Privacy and control | Gmail and Outlook provide enterprise controls, but cloud processing and account policies vary by edition and configuration. | The same applies to Microsoft account, tenant, and license configuration. | Zephyx makes provider state explicit, keeps AI writes confirmation-bound, preserves user ownership checks, avoids logging message contents/secrets, and labels unavailable external integrations `NOT_CONFIGURED`. This is a design and implementation policy, not a promise of absolute privacy. |

## What Zephyx already exposes on v0.8

The Web Workspace at `/workspace` is a real authenticated product surface. It calls `/api/productivity/workspace`, renders loading/error/empty states, shows explainable Smart Inbox signals, displays productivity metric cards, supports visible sender/date/priority/folder/attachment/task filters, saves searches locally, and allows density and panel customization. The page includes real actions for creating a task from a message, setting/snoozing/completing a follow-up, and requesting AI insights.

The message detail flow exposes real Task and Calendar Event forms. Both preserve `emailId`, validate user input, show loading/error/success behavior, and call the existing productivity API. The AI insights endpoint requires authentication and ownership, validates structured output, and returns `NOT_CONFIGURED` through a clear unavailable response when no provider is configured.

The Flutter app includes a real Productivity Dashboard route at `/workspace`. It reads the Workspace API through the existing Dio provider, renders email/tasks/meetings/drafts/follow-ups, handles loading and retry states, applies RTL based on locale, and has widget coverage for all fifteen locales, Arabic/Urdu narrow layouts, and error handling.

## Product principles that make the difference real

1. **Explainability before automation.** Every ranking or AI signal must show its reason, confidence, or unavailable state. A user must be able to override it.
2. **One context, reversible actions.** A Task or Event created from email keeps the source message link and must be undoable or editable without losing context.
3. **Confirmation before writes.** Summaries and suggestions are read-only until the user explicitly applies them. AI must never silently send mail, create an event, or alter a task.
4. **Offline honesty.** The UI must show queued, replaying, conflicted, failed, or not-supported states. Send is not silently replayed.
5. **Account and tenant isolation.** Search, task/event conversion, AI analysis, follow-ups, and realtime events must be scoped to the authenticated user and account.
6. **Internationalization as behavior.** RTL, locale-aware dates/numbers, CJK text, long strings, and keyboard navigation are acceptance criteria, not post-release polish.

## Acceptance measurements

| Capability | Minimum evidence before calling it complete |
|---|---|
| Smart Inbox | Real authenticated API response, deterministic reasons and score, quick actions persisted through API, loading/error/empty states, Playwright flow, and ownership test. |
| Workspace Dashboard | Real API snapshot with all panels, responsive layout, customization persistence, keyboard and screen-reader checks, Web and Flutter tests. |
| Email to Task/Event | Request payload contains source email ID, server persistence is verified, success/error/loading states are covered, and IDOR is rejected. |
| AI | Provider-backed success test, malformed-provider-output test, rate/error test, `NOT_CONFIGURED` test, no automatic write test, and privacy-safe logging review. |
| Follow-up Center | Persistent lifecycle, snooze and complete requests, due-state behavior, reply reconciliation job, retry policy, and integration tests. |
| Global Search | Visible query plan, supported filter contract, invalid-input behavior, Unicode/Arabic/Urdu/CJK tests, cursor pagination, and tenant isolation. |
| Offline-first mobile | Encrypted restart recovery, deduplication/coalescing, expected-version conflict reconciliation, permanent-failure state, and an explicit non-queued Send path. |
| Customization and accessibility | Persisted settings, mobile layout, RTL layout, keyboard-only flow, serious/critical axe checks, Flutter overflow checks, and fifteen-locale coverage. |

## Sources

[1] [Google Support — Collaborate with Gemini in Gmail](https://support.google.com/mail/answer/14355636?hl=en&co=GENIE.Platform%3DDesktop)

[2] [Google Workspace — Gemini in Gmail](https://workspace.google.com/products/gmail/ai/)

[3] [Google Support — Refine searches in Gmail](https://support.google.com/mail/answer/7190?hl=en&co=GENIE.Platform%3DAndroid)

[4] [Google Calendar Help — Create and manage tasks in Google Calendar](https://support.google.com/calendar/answer/9901136?hl=en&co=GENIE.Platform%3DDesktop)

[5] [Microsoft Support — Focused Inbox for Outlook](https://support.microsoft.com/en-us/outlook/mail/focused-inbox-for-outlook)

[6] [Microsoft Support — How to work offline in Outlook for Windows](https://support.microsoft.com/en-us/outlook/getstarted/how-to-work-offline-in-outlook-for-windows)

[7] [Microsoft Support — How to search in Outlook](https://support.microsoft.com/en-us/outlook/getstarted/how-to-search-in-outlook)

[8] [Microsoft Support — Best practices for Outlook](https://support.microsoft.com/en-us/outlook/best-practices-for-outlook)
