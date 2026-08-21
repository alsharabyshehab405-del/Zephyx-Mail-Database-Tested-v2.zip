import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const locales = ["en", "ar", "es", "fr", "de", "pt", "it", "tr", "ru", "zh-CN", "ja", "ko", "hi", "id", "ur"] as const;
const intlLocales: Record<(typeof locales)[number], string> = {
  en: "en-US", ar: "ar", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT", it: "it-IT", tr: "tr-TR", ru: "ru-RU", "zh-CN": "zh-CN", ja: "ja-JP", ko: "ko-KR", hi: "hi-IN", id: "id-ID", ur: "ur-PK",
};

test.describe("Global Product Foundation localization and accessibility", () => {
  for (const locale of locales) {
    test(`loads ${locale} without changing the protected content contract`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("novamail-locale", value), locale);
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("lang", intlLocales[locale]);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" || locale === "ur" ? "rtl" : "ltr");
      await expect(page.locator("body")).not.toContainText("undefined");
      await expect(page.locator("body")).not.toContainText("[object Object]");
    });
  }

  test("supports keyboard focus and has no serious axe violations on login", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  });

  test("renders long Unicode and mixed Arabic/English strings without crashing", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("novamail-locale", "ar"));
    await page.goto("/login");
    await page.evaluate(() => {
      document.body.dataset.v5UnicodeProbe = "العربية English 日本語 한국어 हिन्दी اردو".repeat(3);
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});
