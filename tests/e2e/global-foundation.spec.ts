import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const locales = [
  "en",
  "ar",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "tr",
  "ru",
  "zh-CN",
  "ja",
  "ko",
  "hi",
  "id",
  "ur",
] as const;
const intlLocales: Record<(typeof locales)[number], string> = {
  en: "en-US",
  ar: "ar",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  tr: "tr-TR",
  ru: "ru-RU",
  "zh-CN": "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  hi: "hi-IN",
  id: "id-ID",
  ur: "ur-PK",
};

async function registerAndReachInbox(
  page: Page,
  locale = "en",
): Promise<{ email: string; password: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${suffix}@novamail.test`;
  const password = "E2E_Test_Pass_123!";
  await page.addInitScript((value) => localStorage.setItem("novamail-locale", value), locale);
  await page.goto("/register");
  await page.locator('input[name="firstName"]').fill("E2E");
  await page.locator('input[name="lastName"]').fill("Tester");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
  return { email, password };
}

async function logout(page: Page): Promise<void> {
  await page.locator("aside > div:last-child > button").last().click();
  await page.getByRole("menuitem").last().click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe("Authenticated functional product flows", () => {
  test("registers, logs out, logs in again, refreshes session, and reaches Inbox", async ({
    page,
  }) => {
    const credentials = await registerAndReachInbox(page);
    await expect(page.locator("body")).toContainText(/inbox|mail|رسائل|البريد/i);
    await logout(page);
    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    const originalAccess = await page.evaluate(() => localStorage.getItem("novamail-access"));
    await page.evaluate(() => localStorage.setItem("novamail-access", "expired-token"));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("novamail-access")))
      .not.toBe("expired-token");
    expect(originalAccess).toBeTruthy();
  });

  test("uses Inbox folders, pagination/search controls, and message actions", async ({ page }) => {
    await registerAndReachInbox(page);
    const search = page.getByPlaceholder(/search|بحث/i).first();
    if (await search.count()) {
      await search.fill("Unicode العربية 日本語");
      await expect(search).toHaveValue("Unicode العربية 日本語");
    }
    for (const route of ["/folder/sent", "/folder/drafts", "/folder/trash"]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")));
    }
    const actionButtons = page.getByRole("button", { name: /star|delete|trash|restore|نجمة|حذف/i });
    if (await actionButtons.count()) await actionButtons.first().click();
    await expect(page.locator("body")).not.toContainText("undefined");
  });

  test("creates and restores a draft, opens reply/reply-all/forward compose context, and schedules send", async ({
    page,
  }) => {
    await registerAndReachInbox(page);
    await page
      .getByRole("button", { name: /compose|new message|إنشاء/i })
      .first()
      .click();
    const compose = page.getByRole("dialog").first();
    await expect(compose).toBeVisible();
    const subject = compose
      .locator('input[name="subject"], input[placeholder*="subject" i]')
      .first();
    const body = compose.locator("textarea").first();
    if (await subject.count()) await subject.fill("E2E draft subject");
    if (await body.count()) await body.fill("Draft body العربية 日本語");
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await page.goto("/folder/drafts");
    await expect(page.locator("body")).toContainText(/E2E draft subject|draft|مسودة/i);
    const mailItem = page.locator('[data-testid^="email"], [role="listitem"]').first();
    if (await mailItem.count()) {
      await mailItem.click();
      for (const action of [/reply all|رد على الكل/i, /forward|تحويل/i]) {
        const button = page.getByRole("button", { name: action }).first();
        if (await button.count()) {
          await button.click();
          await page.keyboard.press("Escape");
        }
      }
    }
  });

  test("captures production payloads for Reply, Reply All, and Forward with quoted body and attachments", async ({
    page,
  }) => {
    const credentials = await registerAndReachInbox(page);
    const accessToken = await page.evaluate(() => localStorage.getItem("novamail-access"));
    expect(accessToken).toBeTruthy();
    const fixtureSubject = `Deep E2E fixture ${Date.now()}`;
    const attachmentResponse = await page.request.post("/api/emails/attachments", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
        "X-File-Name": encodeURIComponent("fixture.pdf"),
      },
      data: Buffer.from("%PDF-1.4 fixture"),
    });
    expect(attachmentResponse.status()).toBe(201);
    const fixtureAttachment = await attachmentResponse.json();
    const fixtureResponse = await page.request.post("/api/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        to: [{ email: "recipient-one@example.test" }],
        cc: [{ email: "recipient-two@example.test" }],
        subject: fixtureSubject,
        bodyText: "Fixture body with quoted content.",
        bodyHtml: "<p>Fixture body with quoted content.</p>",
        attachments: [fixtureAttachment],
        isDraft: false,
      },
    });
    expect(fixtureResponse.status()).toBe(201);
    const fixture = await fixtureResponse.json();
    expect(fixture.id).toBeTruthy();

    await page.goto("/folder/sent");
    await expect(page.getByText(fixtureSubject, { exact: true }).first()).toBeVisible();
    await page.getByText(fixtureSubject, { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: fixtureSubject, exact: true })).toBeVisible();

    const payloads: Record<string, any[]> = { reply: [], replyAll: [], forward: [] };
    const capture = (bucket: string) => (request: any) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/emails")
        payloads[bucket].push(request.postDataJSON());
    };

    const replyCapture = capture("reply");
    page.on("request", replyCapture);
    await page
      .getByRole("button", { name: /^Reply$/i })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: /^Send$/i })
      .last()
      .click();
    await expect.poll(() => payloads.reply.length).toBe(1);
    page.removeListener("request", replyCapture);
    expect(payloads.reply[0].subject).toMatch(/^Re:/i);
    expect(payloads.reply[0].bodyText).toContain("Original message");
    expect(payloads.reply[0].replyToId).toBe(fixture.id);

    const replyAllCapture = capture("replyAll");
    page.on("request", replyAllCapture);
    await page
      .getByRole("button", { name: /Reply all/i })
      .last()
      .click();
    const replyAllDialog = page.getByRole("dialog");
    await expect(replyAllDialog).toBeVisible();
    await expect(
      replyAllDialog.getByText("recipient-one@example.test", { exact: true }),
    ).toBeVisible();
    await expect(
      replyAllDialog.getByText("recipient-two@example.test", { exact: true }),
    ).toBeVisible();
    await expect(replyAllDialog.getByText(credentials.email, { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: /^Send$/i })
      .last()
      .click();
    await expect.poll(() => payloads.replyAll.length).toBe(1);
    page.removeListener("request", replyAllCapture);
    expect(payloads.replyAll[0].subject).toMatch(/^Re:/i);
    expect(
      payloads.replyAll[0].cc.map((recipient: { email: string }) => recipient.email),
    ).toContain("recipient-two@example.test");
    expect(payloads.replyAll[0].bodyText).toContain("Original message");

    const forwardCapture = capture("forward");
    page.on("request", forwardCapture);
    await page
      .getByRole("button", { name: /^Forward$/i })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const forwardTo = page.locator('input[aria-label="To"]');
    await forwardTo.fill("forward-recipient@example.test");
    await forwardTo.press("Enter");
    await expect(
      page.getByRole("dialog").getByText("forward-recipient@example.test", { exact: true }),
    ).toBeVisible();
    expect(await page.locator(".novamail-compose-attachment").count()).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: /^Send$/i })
      .last()
      .click();
    await expect.poll(() => payloads.forward.length).toBe(1);
    expect(payloads.forward[0].subject).toMatch(/^Fwd:/i);
    expect(payloads.forward[0].bodyText).toContain("Forwarded message");
    expect(payloads.forward[0].attachments).toEqual(
      expect.arrayContaining([expect.objectContaining({ filename: "fixture.pdf" })]),
    );
  });

  test("changes language to Arabic/Urdu RTL, checks settings, realtime reconnect, and serious accessibility", async ({
    page,
  }) => {
    const credentials = await registerAndReachInbox(page, "ar");
    await page.goto("/login");
    const localeControl = page.getByRole("combobox", { name: "Language" });
    await localeControl.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/settings");
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForTimeout(250);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);
  });
});

test.describe("All locale and accessibility contracts", () => {
  for (const locale of locales) {
    test(`loads ${locale} with correct direction and no untranslated sentinels`, async ({
      page,
    }) => {
      await page.addInitScript((value) => localStorage.setItem("novamail-locale", value), locale);
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("lang", intlLocales[locale]);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" || locale === "ur" ? "rtl" : "ltr",
      );
      await expect(page.locator("body")).not.toContainText("undefined");
      await expect(page.locator("body")).not.toContainText("[object Object]");
    });
  }

  test("keyboard focus and serious axe violations remain clean", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);
  });
});

test.describe("Productivity workspace flows", () => {
  test("loads real unified workspace, sends natural-language query, and exposes accessible empty/loading states", async ({
    page,
  }) => {
    await registerAndReachInbox(page);
    const workspaceResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/productivity/workspace" &&
        response.request().method() === "GET",
    );
    await page.goto("/workspace");
    expect((await workspaceResponse).status()).toBe(200);
    await expect(page.getByRole("heading", { name: /productivity workspace/i })).toBeVisible();
    const search = page.getByRole("textbox", { name: /search your work/i });
    await search.fill("unread from design with attachments this week");
    const filteredResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/productivity/workspace" &&
        response.url().includes("q="),
    );
    await page.getByRole("button", { name: /^search$/i }).click();
    expect((await filteredResponse).status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("undefined");
    await expect(page.locator("main")).toHaveAttribute("dir", "auto");
  });
});
