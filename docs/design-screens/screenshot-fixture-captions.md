# v0.8 UX screenshots

These screenshots were captured from the local authenticated Web app on 2026-08-22T12:33:55.986Z using a newly registered non-secret test account. The messages, task, event, draft, and follow-up were created through the production API routes backed by the isolated PostgreSQL test database; no mock production data or real user data was used.

| File | Evidence |
|---|---|
| after-inbox-populated.png | Inbox with three PostgreSQL-backed messages and Smart Inbox sections. |
| after-workspace-populated.png | Workspace with an overdue task, upcoming meeting, draft, and follow-up linked to the planning message. |
| after-compose-recipient-chips.png | Compose with independent To, Cc, and Bcc chips. |
| after-inbox-ar-rtl.png | Arabic locale with document direction set to RTL and populated Inbox. |
| after-inbox-mobile-narrow.png | 390px-wide mobile Inbox with populated data and touch-friendly layout. |

The fixture account and all generated records are isolated to the local test database and are not credentials or production data.
