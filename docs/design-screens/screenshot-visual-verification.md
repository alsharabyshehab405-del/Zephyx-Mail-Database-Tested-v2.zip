# Visual verification of v0.8 screenshots

The populated Inbox screenshot was visually checked and shows three PostgreSQL-backed messages, Smart Inbox tabs with non-zero counts, the collapsed Advanced filters control, and the collapsible verification/security banners. It is not the previous empty-state screenshot.

The populated Workspace screenshot was visually checked and shows the active Workspace sidebar item, non-zero summary cards for important messages, overdue tasks, upcoming meetings, drafts, needs-a-reply, and follow-ups, plus linked message/task cards. The screenshot is visibly populated rather than a zero-count placeholder.

Verification date: 2026-08-22.

The Compose screenshot was visually checked and shows separate To, Cc, and Bcc recipient chips with clear remove controls, alongside AI Write/Rephrase/Shorten and Save draft controls.

The Arabic screenshot was visually checked and shows Arabic banner/sidebar labels, right-to-left navigation placement, RTL controls, and populated message rows. The browser document direction was asserted as `rtl` before capture.

The narrow mobile screenshot was visually checked at **390 × 844**. It shows the populated Inbox, mobile header/menu, visible quick search and Advanced filters, bottom navigation, and a touch-sized Compose action without a desktop sidebar being forced into the viewport.

## Final review capture — 2026-08-22

- `after-inbox-populated.png`: 1280×720، رسالة اختبار مع مرفق وإشارات Smart Inbox (High priority، Important signal، Work context، Meeting context، Deadline signal، Unread) ظاهرة؛ Verify email مفتوح في desktop، وSecure account مطوي، وهو السلوك المقصود لأن الإغلاق الافتراضي الجديد mobile-only.
- `after-workspace-populated.png`: 1280×1342، بيانات PostgreSQL الاختبارية ظاهرة فعليًا: رسالة مهمة، مهمة متأخرة، اجتماع قادم، مسودة، ومتابعة Waiting for reply، مع Workspace active في Sidebar.

- `after-compose-recipient-chips.png`: 1280×720، Compose يعرض To/Cc/Bcc كشرائح منفصلة مع أزرار إزالة، وأزرار AI Write/Rephrase/Shorten وDelivery options وSave draft وSend ضمن هوية Zephyx.
- `after-inbox-ar-rtl.png`: 390×844، Arabic RTL فعلي؛ البحث والفلاتر وأقسام Smart Inbox والإشارات مترجمة، البنران مطويان إلى شريطي summary صغيرين، والتنقل السفلي والـCompose FAB داخل العرض دون قص أفقي ظاهر.

- `after-inbox-mobile-narrow.png`: 390×844، English mobile Inbox بعد التصحيح؛ Verify email وSecure account مطويان افتراضيًا، مع بقاء البحث السريع وAdvanced filters وأقسام Smart Inbox والرسالة والتنقل السفلي وCompose FAB واضحة، دون overflow أفقي ظاهر.

## v0.9 unified workspace capture review — 2026-08-22

- `v09-inbox-populated-web.png` — 1280×720. Shows a real PostgreSQL-backed Inbox message, Smart Inbox counts, Account/Focus controls, collapsed Advanced filters, and the Gmail OAuth `NOT_CONFIGURED` boundary. Desktop banners remain available as collapsible surfaces; mobile default collapse is verified separately.
- `v09-workspace-populated-web.png` — 1280×1428. Shows one important message, one overdue task, one upcoming meeting, one draft, and one follow-up from the isolated test database. Account switcher, Focus mode, source actions, and Privacy Center navigation are visible. Message content and sender values remain fixture data and are not translated.

- `v09-compose-ar-rtl-mobile-390.png` — 390×844. Arabic RTL Compose shows separate To/Cc/Bcc chips, right-aligned labels, RTL action ordering, stable attachment/Delivery/Save/Send controls, and no horizontal clipping. Recipient email values remain LTR strings as intended.
- `v09-workspace-ar-rtl-mobile-390.png` — 390×2652 full-page capture at a 390px viewport. Arabic headings, account/focus controls, six summary cards, Smart Inbox, overdue tasks, upcoming meetings, drafts, and follow-up center are rendered RTL with real fixture data; no horizontal overflow is visible.
