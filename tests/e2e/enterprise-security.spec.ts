import { expect, test, type Page } from "@playwright/test";

async function registerAndReachInbox(page: Page): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `enterprise-e2e-${suffix}@novamail.test`;
  const password = "E2E_Test_Pass_123!";
  await page.addInitScript(() => localStorage.setItem("novamail-locale", "ar"));
  await page.goto("/register");
  await page.locator('input[name="firstName"]').fill("Enterprise");
  await page.locator('input[name="lastName"]').fill("Tester");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}

test("Enterprise Security onboarding and organization summary are accessible", async ({ page }) => {
  await registerAndReachInbox(page);
  await page.goto("/enterprise-security");
  await expect(page.getByRole("heading", { name: "مركز أمان المؤسسة" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Security onboarding" })).toBeVisible();
  await page.getByRole("button", { name: "حسنًا" }).click();
  await page.getByPlaceholder("اسم مؤسسة جديدة").fill("Acme Security");
  await page.getByRole("button", { name: "إنشاء" }).click();
  await expect(page.locator("#organization-select")).toContainText("Acme Security");
  await expect(page.getByRole("heading", { name: "الأعضاء والصلاحيات" })).toBeVisible();
  await expect(page.getByText("متوسط Risk Score", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveText(/horizontal overflow/i);
});
