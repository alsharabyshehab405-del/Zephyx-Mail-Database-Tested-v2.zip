# UX review notes — Inbox and Workspace

Reviewed on 2026-08-22 from the latest local authenticated screenshots.

## Inbox

The Inbox screenshot shows Verify email and Secure account banners occupying the full width above the shell. The advanced search controls are always expanded below the quick search field, which pushes Smart Inbox sections down and leaves little room for message rows. The Smart Inbox section row is present, but the screenshot is empty-state data, so the next capture must use a real seeded message and demonstrate the row action bar and visible ranking reasons. The sidebar contains Workspace and Templates; the active state must be verified explicitly on `/workspace` so only Workspace is highlighted.

## Workspace

The Workspace screenshot already shows the intended unified layout with important mail, overdue tasks, upcoming meetings, drafts, replies-needed, and follow-ups. However, all metrics are zero because the captured account has no seeded productivity records, so the next validation must seed a real PostgreSQL message, overdue task, upcoming event, draft, and follow-up and verify each card opens its source. Workspace is visibly active in this screenshot, but the Templates item also has a dark hover/selection-looking background; the Sidebar active-state logic must be made route-exact and hover styles must not look like a second active item.

The Workspace header has visible search, Save search, and Customize workspace controls. New captures should include populated data, Arabic RTL, and a narrow mobile viewport. Compose needs a capture with committed To/Cc/Bcc chips rather than only the empty compose surface.
