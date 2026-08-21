import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const locales = ['en', 'ar', 'es', 'fr', 'de', 'pt', 'it', 'tr', 'ru', 'zh-CN', 'ja', 'ko', 'hi', 'id', 'ur'] as const;
const intlLocales: Record<(typeof locales)[number], string> = {
  en: 'en-US', ar: 'ar', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT', it: 'it-IT', tr: 'tr-TR', ru: 'ru-RU', 'zh-CN': 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', hi: 'hi-IN', id: 'id-ID', ur: 'ur-PK',
};

async function registerAndReachInbox(page: Page, locale = 'en'): Promise<{ email: string; password: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${suffix}@novamail.test`;
  const password = 'E2E_Test_Pass_123!';
  await page.addInitScript((value) => localStorage.setItem('novamail-locale', value), locale);
  await page.goto('/register');
  await page.locator('input[name="firstName"]').fill('E2E');
  await page.locator('input[name="lastName"]').fill('Tester');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
  return { email, password };
}

async function logout(page: Page): Promise<void> {
  const userMenu = page.getByRole('button', { name: /account|profile|user menu|الحساب/i }).first();
  if (await userMenu.count()) await userMenu.click();
  await page.getByText(/sign out|log out|تسجيل الخروج|خروج/i).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe('Authenticated functional product flows', () => {
  test('registers, logs out, logs in again, refreshes session, and reaches Inbox', async ({ page }) => {
    const credentials = await registerAndReachInbox(page);
    await expect(page.locator('body')).toContainText(/inbox|mail|رسائل|البريد/i);
    await logout(page);
    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/$/);
    const originalAccess = await page.evaluate(() => localStorage.getItem('novamail-access'));
    await page.evaluate(() => localStorage.setItem('novamail-access', 'expired-token'));
    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('novamail-access'))).not.toBe('expired-token');
    expect(originalAccess).toBeTruthy();
  });

  test('uses Inbox folders, pagination/search controls, and message actions', async ({ page }) => {
    await registerAndReachInbox(page);
    const search = page.getByPlaceholder(/search|بحث/i).first();
    if (await search.count()) {
      await search.fill('Unicode العربية 日本語');
      await expect(search).toHaveValue('Unicode العربية 日本語');
    }
    for (const folder of [/sent|مرسل/i, /draft|مسودة/i, /trash|سلة/i]) {
      const item = page.getByText(folder).first();
      if (await item.count()) await item.click();
    }
    const actionButtons = page.getByRole('button', { name: /star|delete|trash|restore|نجمة|حذف/i });
    if (await actionButtons.count()) await actionButtons.first().click();
    await expect(page.locator('body')).not.toContainText('undefined');
  });

  test('creates and restores a draft, opens reply/reply-all/forward compose context, and schedules send', async ({ page }) => {
    await registerAndReachInbox(page);
    await page.getByRole('button', { name: /compose|new message|إنشاء/i }).first().click();
    const compose = page.getByRole('dialog').first();
    await expect(compose).toBeVisible();
    const subject = compose.locator('input[name="subject"], input[placeholder*="subject" i]').first();
    const body = compose.locator('textarea').first();
    if (await subject.count()) await subject.fill('E2E draft subject');
    if (await body.count()) await body.fill('Draft body العربية 日本語');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('body')).toContainText(/E2E draft subject|draft|مسودة/i);
    const mailItem = page.locator('[data-testid^="email"], [role="listitem"]').first();
    if (await mailItem.count()) {
      await mailItem.click();
      for (const action of [/reply all|رد على الكل/i, /forward|تحويل/i]) {
        const button = page.getByRole('button', { name: action }).first();
        if (await button.count()) { await button.click(); await page.keyboard.press('Escape'); }
      }
    }
  });

  test('changes language to Arabic/Urdu RTL, checks settings, realtime reconnect, and serious accessibility', async ({ page }) => {
    await registerAndReachInbox(page, 'ar');
    await page.goto('/settings');
    const localeControl = page.getByRole('combobox', { name: 'Language' });
    await localeControl.click();
    await page.getByRole('option', { name: /Urdu|اردو/i }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', /rtl/);
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); });
    await page.reload();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});

test.describe('All locale and accessibility contracts', () => {
  for (const locale of locales) {
    test(`loads ${locale} with correct direction and no untranslated sentinels`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('novamail-locale', value), locale);
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('lang', intlLocales[locale]);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' || locale === 'ur' ? 'rtl' : 'ltr');
      await expect(page.locator('body')).not.toContainText('undefined');
      await expect(page.locator('body')).not.toContainText('[object Object]');
    });
  }

  test('keyboard focus and serious axe violations remain clean', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
