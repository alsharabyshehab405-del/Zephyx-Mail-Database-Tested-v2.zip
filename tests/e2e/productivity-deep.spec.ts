import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function registerAndToken(page: Page): Promise<{ email: string; token: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `productivity-${suffix}@novamail.test`;
  await page.goto("/register");
  await page.locator('input[name="firstName"]').fill("Productivity");
  await page.locator('input[name="lastName"]').fill("Tester");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("E2E_Test_Pass_123!");
  await page.locator('input[name="confirmPassword"]').fill("E2E_Test_Pass_123!");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
  const token = await page.evaluate(() => localStorage.getItem("novamail-access"));
  expect(token).toBeTruthy();
  return { email, token: token! };
}

async function createInboxFixture(
  page: Page,
  token: string,
): Promise<{ id: string; subject: string }> {
  const subject = `Quarterly planning meeting ${Date.now()}`;
  const attachmentResponse = await page.request.post("/api/emails/attachments", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent("planning.pdf"),
    },
    data: Buffer.from("%PDF-1.4 planning fixture"),
  });
  expect(attachmentResponse.status()).toBe(201);
  const attachment = await attachmentResponse.json();
  const create = await page.request.post("/api/emails", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      to: [{ email: "fixture-recipient@example.test" }],
      subject,
      bodyText: "Please reply before Friday. Meeting agenda and project deadline are attached.",
      bodyHtml:
        "<p>Please reply before Friday. Meeting agenda and project deadline are attached.</p>",
      attachments: [attachment],
      isDraft: false,
    },
  });
  expect(create.status()).toBe(201);
  const created = await create.json();
  const move = await page.request.patch(`/api/emails/${created.id}/move`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { folder: "inbox" },
  });
  expect(move.status()).toBe(200);
  const unread = await page.request.patch(`/api/emails/${created.id}/read`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { isRead: false },
  });
  expect(unread.status()).toBe(200);
  return { id: created.id as string, subject };
}

test.describe.configure({ mode: "serial" });

test.describe("Productivity-first authenticated flows", () => {
  test("renders Smart Inbox sections and executes real quick actions", async ({ page }) => {
    const { token } = await registerAndToken(page);
    await createInboxFixture(page, token);
    await page.goto("/");
    await expect(page.getByRole("tablist", { name: /smart inbox sections/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /important/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /needs follow-up/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /deadlines/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /personal/i })).toBeVisible();
    await page.getByRole("tab", { name: /unread/i }).click();
    await expect(page.getByRole("tab", { name: /unread/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const quickAction = page.getByRole("button", { name: /mark.*read|read.*message/i }).first();
    await expect(quickAction).toBeVisible();
    const request = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/api\/emails\/.+\/read$/.test(new URL(response.url()).pathname),
    );
    await quickAction.click();
    expect((await request).status()).toBe(200);
  });

  test("loads the unified dashboard and converts a real message to a Task and Event", async ({
    page,
  }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: /your productivity workspace/i })).toBeVisible();
    const fixtureMessage = page
      .locator("article")
      .filter({ hasText: fixture.subject })
      .getByRole("button")
      .first();
    await fixtureMessage.scrollIntoViewIfNeeded();
    await expect(fixtureMessage).toBeVisible();

    const taskRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/productivity/tasks",
    );
    await page
      .getByRole("button", { name: /create task/i })
      .first()
      .click();
    expect((await taskRequest).status()).toBe(201);

    await fixtureMessage.click();
    await expect(page).toHaveURL(/email=/);
    await expect(page.getByRole("button", { name: /create event/i })).toBeVisible();
    await page.getByRole("button", { name: /create event/i }).click();
    await expect(page.locator("#email-event-title")).toBeVisible();
    await page.locator("#email-event-title").fill("Planning event");
    await page.locator("#email-event-start").fill("2026-08-25T10:00");
    await page.locator("#email-event-end").fill("2026-08-25T11:00");
    const eventRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/productivity/calendar/events",
    );
    await page.getByRole("button", { name: /save event/i }).click();
    expect((await eventRequest).status()).toBe(201);
  });

  test("applies visible global search filters through the real workspace API", async ({ page }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    await page.goto("/workspace");
    const searchFixtureMessage = page
      .locator("article")
      .filter({ hasText: fixture.subject })
      .getByRole("button")
      .first();
    await searchFixtureMessage.scrollIntoViewIfNeeded();
    await expect(searchFixtureMessage).toBeVisible();
    await page.getByText(/search filters/i).click();
    await page.getByLabel(/sender/i).fill("fixture-recipient@example.test");
    await page.getByLabel(/has attachments/i).check();
    await page.getByLabel(/priority/i).selectOption("high");
    const filteredResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/productivity/workspace" &&
        (new URL(response.url()).searchParams.get("q") ?? "").includes("from:"),
    );
    await page.getByRole("button", { name: /apply filters/i }).click();
    expect((await filteredResponse).status()).toBe(200);
    await expect(page.getByText(/from:fixture-recipient@example.test/i)).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });

  test("runs follow-up center actions and keeps Workspace keyboard-accessible", async ({
    page,
  }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    const created = await page.request.post("/api/productivity/follow-ups", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        emailId: fixture.id,
        remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        note: "Follow up on the planning reply",
      },
    });
    expect(created.status()).toBe(201);
    await page.goto("/workspace");
    const followUpFixtureMessage = page
      .locator("article")
      .filter({ hasText: fixture.subject })
      .getByRole("button")
      .first();
    await followUpFixtureMessage.scrollIntoViewIfNeeded();
    await expect(followUpFixtureMessage).toBeVisible();
    const snoozeRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/api\/productivity\/follow-ups\/.+/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: /snooze 1 day/i }).click();
    expect((await snoozeRequest).status()).toBe(200);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === "critical" || violation.impact === "serious",
      ),
    ).toEqual([]);
  });

  test("exposes AI success/error/not-configured through the real endpoint contract", async ({
    page,
  }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    const unauthorized = await page.request.post(`/api/ai/insights/${fixture.id}`);
    expect(unauthorized.status()).toBe(401);
    const tasksBeforeResponse = await page.request.get("/api/productivity/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tasksBeforeResponse.status()).toBe(200);
    const tasksBefore = await tasksBeforeResponse.json();
    const response = await page.request.post(`/api/ai/insights/${fixture.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 503]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(typeof body.summary).toBe("string");
      expect(typeof body.needsFollowUp).toBe("boolean");
      expect(body.priority).toMatch(/^(low|normal|high)$/);
    } else {
      const body = await response.json();
      expect(String(body.error ?? body.message)).toMatch(/not configured|unavailable/i);
    }
    const invalid = await page.request.post("/api/ai/insights/not-a-real-email", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(invalid.status()).toBe(404);
    const tasksAfterResponse = await page.request.get("/api/productivity/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tasksAfterResponse.status()).toBe(200);
    const tasksAfter = await tasksAfterResponse.json();
    expect(tasksAfter.tasks.map((task: { id: string }) => task.id)).toEqual(
      tasksBefore.tasks.map((task: { id: string }) => task.id),
    );
  });
});

test.describe("Compose productivity flows", () => {
  test("validates recipient chips and saves a real draft", async ({ page }) => {
    await registerAndToken(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: /compose/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const to = page.locator('input[aria-label="To"]');
    const cc = page.locator('input[aria-label="Cc"]');
    const bcc = page.locator('input[aria-label="Bcc"]');
    await to.fill("not-an-email");
    await to.press("Enter");
    await expect(page.getByText("not-an-email", { exact: true }).locator("..")).toHaveClass(
      /border-destructive/,
    );
    await page.getByRole("button", { name: /remove recipient: not-an-email/i }).click();
    await expect(page.getByText("not-an-email", { exact: true })).toHaveCount(0);
    await to.fill("productivity-recipient@example.test");
    await to.press("Enter");
    await cc.fill("copy@example.test");
    await cc.press("Enter");
    await bcc.fill("blind-copy@example.test");
    await bcc.press("Enter");
    await expect(
      page.getByText("productivity-recipient@example.test", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("copy@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("blind-copy@example.test", { exact: true })).toBeVisible();

    await page.locator('input[placeholder="Subject"]').fill("Draft from productivity flow");
    await page
      .locator('[contenteditable="true"][role="textbox"]')
      .fill("A real draft saved through the API.");
    const draftResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/emails",
    );
    await page.getByRole("button", { name: /save draft/i }).click();
    const draft = await draftResponse;
    expect(draft.status()).toBe(201);
    expect((await draft.json()).isDraft).toBe(true);
  });

  test("schedules a real message through the delivery options contract", async ({ page }) => {
    await registerAndToken(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: /compose/i })
      .first()
      .click();
    await page.locator('input[aria-label="To"]').fill("scheduled-recipient@example.test");
    await page.locator('input[aria-label="To"]').press("Enter");
    await page.locator('input[placeholder="Subject"]').fill("Scheduled productivity message");
    await page
      .locator('[contenteditable="true"][role="textbox"]')
      .fill("This scheduled message uses the production compose path.");
    await page.getByText(/delivery options/i).click();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
    await page.locator("#scheduled-at").fill(future);
    const scheduledResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/emails",
    );
    await page.getByRole("button", { name: /send/i }).click();
    const scheduled = await scheduledResponse;
    expect(scheduled.status()).toBe(201);
    expect((await scheduled.json()).status).toBe("scheduled");
  });
});

test.describe("UX correction flows", () => {
  test("keeps Workspace active and advanced filters collapsible", async ({ page }) => {
    await registerAndToken(page);
    await page.goto("/");

    const primaryNav = page.locator('nav[aria-label="Primary navigation"]:visible').first();
    const workspaceNav = primaryNav.locator('button[data-nav-id="workspace"]');
    await expect(workspaceNav).toBeVisible();
    await workspaceNav.click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(workspaceNav).toHaveClass(/bg-slate-800/);
    await expect(workspaceNav).toHaveAttribute("aria-current", "page");
    await expect(workspaceNav).toHaveAttribute("data-active", "true");
    const templates = primaryNav.locator('button[data-nav-id="templates"]');
    if (await templates.count()) {
      await expect(templates.first()).not.toHaveAttribute("aria-current", "page");
      await expect(templates.first()).not.toHaveClass(/bg-slate-800/);
      await expect(templates.first()).toHaveAttribute("data-active", "false");
    }

    await page.goto("/");
    await expect(page.locator('input[type="search"]').first()).toBeVisible();
    const advancedFilters = page.locator("details").filter({ hasText: /advanced filters/i });
    await expect(advancedFilters).toBeVisible();
    await expect(advancedFilters).toHaveJSProperty("open", false);
    await advancedFilters.locator("summary").click();
    await expect(advancedFilters).toHaveJSProperty("open", true);
  });

  test("persists the collapsed verification banner state for the signed-in user", async ({
    page,
  }) => {
    await registerAndToken(page);
    await page.goto("/");
    const verification = page.locator("details.novamail-inbox-verification-collapsible").first();
    await expect(verification).toBeVisible();
    await verification.locator("summary").click();
    await expect(verification).toHaveAttribute("data-collapsed", "true");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator("details.novamail-inbox-verification-collapsible").first(),
    ).toHaveAttribute("data-collapsed", "true");
  });

  test("collapses both account banners by default on a narrow mobile viewport", async ({ page }) => {
    await registerAndToken(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });

    const banners = page.locator("details.novamail-inbox-verification-collapsible");
    await expect(banners).toHaveCount(2);
    await expect(banners.nth(0)).toHaveAttribute("data-collapsed", "true");
    await expect(banners.nth(1)).toHaveAttribute("data-collapsed", "true");
    await expect(banners.nth(0)).toHaveJSProperty("open", false);
    await expect(banners.nth(1)).toHaveJSProperty("open", false);

    await banners.nth(0).locator("summary").click();
    await expect(banners.nth(0)).toHaveAttribute("data-collapsed", "false");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(banners.nth(0)).toHaveAttribute("data-collapsed", "false");
    await expect(banners.nth(1)).toHaveAttribute("data-collapsed", "true");

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
  });

  test("renders Arabic UI labels and RTL Compose chips without mobile overflow", async ({ page }) => {
    const { token } = await registerAndToken(page);
    await createInboxFixture(page, token);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("novamail-locale", "ar"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("أقسام البريد الذكي", { exact: true })).toBeVisible();
    await expect(page.getByText("مرشحات متقدمة", { exact: true })).toBeVisible();
    await expect(page.getByText("أولوية عالية", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("إشارة مهمة", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("سياق العمل", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("غير مقروء", { exact: true }).first()).toBeVisible();

    const composeButton = page.locator('button[aria-label]:visible').filter({ hasText: /إنشاء|رسالة/ }).last();
    await composeButton.click();
    const compose = page.getByRole("dialog");
    await expect(compose).toBeVisible();
    await expect(compose.locator("form")).toHaveAttribute("dir", "rtl");
    await compose.locator('input[aria-label="إلى"]').fill("rtl-to@example.test");
    await compose.locator('input[aria-label="إلى"]').press("Enter");
    await compose.locator('input[aria-label="نسخة إلى"]').fill("rtl-cc@example.test");
    await compose.locator('input[aria-label="نسخة إلى"]').press("Enter");
    await compose.locator('input[aria-label="نسخة مخفية إلى"]').fill("rtl-bcc@example.test");
    await compose.locator('input[aria-label="نسخة مخفية إلى"]').press("Enter");
    await expect(compose.locator('bdi[dir="ltr"]')).toHaveCount(3);
    await expect(compose.getByRole("button", { name: "إرسال" })).toBeVisible();
    await expect(compose.getByRole("button", { name: "حفظ كمسودة" })).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
  });

  test("renders Urdu interface labels and RTL direction on the Workspace route", async ({ page }) => {
    const { token } = await registerAndToken(page);
    await createInboxFixture(page, token);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("novamail-locale", "ur"));
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("region", { name: "ورک اسپیس کا جائزہ" })).toBeVisible();
    await expect(page.getByText("کام بنائیں", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("مصنوعی ذہانت کی بصیرتیں", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("فالو اپ مرکز", { exact: true })).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
  });

  test("renders a populated Workspace from PostgreSQL and opens each linked source", async ({
    page,
  }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const task = await page.request.post("/api/productivity/tasks", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Overdue planning task",
        notes: "Linked to the fixture",
        emailId: fixture.id,
        dueAt: past,
        priority: "high",
      },
    });
    expect(task.status()).toBe(201);
    const event = await page.request.post("/api/productivity/calendar/events", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Upcoming planning meeting",
        description: "Linked meeting",
        emailId: fixture.id,
        startsAt: future,
        endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(event.status()).toBe(201);
    const draft = await page.request.post("/api/emails", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        subject: "Workspace draft",
        bodyText: "Draft content",
        bodyHtml: "<p>Draft content</p>",
        to: [],
        isDraft: true,
      },
    });
    expect(draft.status()).toBe(201);
    const followUp = await page.request.post("/api/productivity/follow-ups", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        emailId: fixture.id,
        remindAt: future,
        waitingForReply: true,
        note: "Awaiting planning reply",
      },
    });
    expect(followUp.status()).toBe(201);
    const workspaceResponse = await page.request.get("/api/productivity/workspace", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(workspaceResponse.status()).toBe(200);
    const workspaceBody = await workspaceResponse.json();
    expect(workspaceBody.followUps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ emailId: fixture.id, waitingForReply: true, status: "open" }),
      ]),
    );

    await page.goto("/workspace");
    await expect(page.locator(`[data-task-id]`)).toContainText("Overdue planning task");
    await expect(page.locator(`[data-event-id]`)).toContainText("Upcoming planning meeting");
    await expect(page.locator(`[data-draft-id]`)).toContainText("Workspace draft");
    await expect(page.locator(`[data-follow-up-id][data-waiting-for-reply="true"]`)).toBeVisible();

    const taskSource = page
      .locator(`[data-task-id][data-email-id="${fixture.id}"]`)
      .getByRole("button")
      .first();
    await taskSource.click();
    await expect(page).toHaveURL(new RegExp(`email=${fixture.id}`));
    await page.goBack();
    await expect(page).toHaveURL(/workspace$/);

    const eventSource = page.locator(`[data-event-id][data-email-id="${fixture.id}"]`);
    await eventSource.click();
    await expect(page).toHaveURL(new RegExp(`email=${fixture.id}`));
    await page.goBack();
    await expect(page).toHaveURL(/workspace$/);

    const draftSource = page.locator("[data-draft-id]").filter({ hasText: "Workspace draft" });
    await draftSource.click();
    await expect(page).toHaveURL(/email=/);
    await page.goBack();
    await expect(page).toHaveURL(/workspace$/);

    const followUpSource = page
      .locator(`[data-follow-up-id][data-email-id="${fixture.id}"]`)
      .getByRole("button")
      .first();
    await followUpSource.click();
    await expect(page).toHaveURL(new RegExp(`email=${fixture.id}`));
  });
});

test.describe("Compose AI and recipient correction flows", () => {
  test("shows recipient autocomplete empty state and AI confirmation boundary", async ({
    page,
  }) => {
    await registerAndToken(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: /compose/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const to = page.locator('input[aria-label="To"]');
    await to.fill("unknown-contact");
    await expect(page.getByText(/no matching contacts/i)).toBeVisible();
    await expect(page.getByText(/contact suggestions are unavailable/i)).toBeVisible();
    await to.press("Enter");

    await page.locator('input[placeholder="Subject"]').fill("AI boundary test");
    await page
      .locator('[contenteditable="true"][role="textbox"]')
      .fill("Please summarize this planning note.");
    const aiResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/ai/write",
    );
    await page.getByRole("button", { name: /AI write/i }).click();
    const response = await aiResponse;
    expect([200, 503]).toContain(response.status());
    if (response.status() === 503) {
      await expect(page.getByText(/not configured|unavailable/i).last()).toBeVisible();
    } else {
      await expect(page.getByRole("region", { name: /review ai suggestion/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /apply suggestion/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /cancel suggestion/i })).toBeVisible();
      await page.getByRole("button", { name: /cancel suggestion/i }).click();
      await expect(page.getByRole("region", { name: /review ai suggestion/i })).toHaveCount(0);
    }
  });
});


test.describe("Unified workspace context and privacy flows", () => {
  test("switches focus mode and keeps account context visible on Workspace", async ({ page }) => {
    await registerAndToken(page);
    await page.goto("/workspace");
    const controls = page.getByTestId("productivity-context-controls");
    await expect(controls).toBeVisible();
    const accountSelect = page.locator("#productivity-account-switcher");
    await expect(accountSelect).toBeVisible();
    await expect(accountSelect.locator("option")).toContainText([/All accounts/i]);
    const focusRequest = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/productivity/focus",
    );
    await controls.getByTestId("focus-mode-follow_up").click();
    expect((await focusRequest).status()).toBe(200);
    await expect(controls.getByTestId("focus-mode-follow_up")).toHaveAttribute("aria-pressed", "true");
  });

  test("opens Privacy Center and persists privacy controls with unconfigured providers explicit", async ({ page }) => {
    await registerAndToken(page);
    await page.goto("/workspace");
    await page.locator('a[href="/privacy-center"]').click();
    await expect(page).toHaveURL(/\/privacy-center$/);
    await expect(page.getByRole("heading", { name: /privacy center/i }).first()).toBeVisible();
    await expect(page.getByText(/not configured/i).first()).toBeVisible();
    const tracking = page.getByRole("checkbox", { name: /tracking pixels/i });
    await expect(tracking).toBeVisible();
    const update = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/privacy/center",
    );
    await tracking.uncheck();
    expect((await update).status()).toBe(200);
    await expect(page.getByRole("status")).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
  });

  test("keeps Workspace controls usable at 390px without horizontal overflow", async ({ page }) => {
    await registerAndToken(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("productivity-context-controls")).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(horizontalOverflow).toBe(false);
  });
});
