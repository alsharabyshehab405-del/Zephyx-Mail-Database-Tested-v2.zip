import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function registerAndToken(page: Page): Promise<{ email: string; token: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `productivity-${suffix}@novamail.test`;
  await page.goto('/register');
  await page.locator('input[name="firstName"]').fill('Productivity');
  await page.locator('input[name="lastName"]').fill('Tester');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('E2E_Test_Pass_123!');
  await page.locator('input[name="confirmPassword"]').fill('E2E_Test_Pass_123!');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
  const token = await page.evaluate(() => localStorage.getItem('novamail-access'));
  expect(token).toBeTruthy();
  return { email, token: token! };
}

async function createInboxFixture(page: Page, token: string): Promise<{ id: string; subject: string }> {
  const subject = `Quarterly planning meeting ${Date.now()}`;
  const attachmentResponse = await page.request.post('/api/emails/attachments', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('planning.pdf') },
    data: Buffer.from('%PDF-1.4 planning fixture'),
  });
  expect(attachmentResponse.status()).toBe(201);
  const attachment = await attachmentResponse.json();
  const create = await page.request.post('/api/emails', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      to: [{ email: 'fixture-recipient@example.test' }],
      subject,
      bodyText: 'Please reply before Friday. Meeting agenda and project deadline are attached.',
      bodyHtml: '<p>Please reply before Friday. Meeting agenda and project deadline are attached.</p>',
      attachments: [attachment],
      isDraft: false,
    },
  });
  expect(create.status()).toBe(201);
  const created = await create.json();
  const move = await page.request.patch(`/api/emails/${created.id}/move`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { folder: 'inbox' },
  });
  expect(move.status()).toBe(200);
  const unread = await page.request.patch(`/api/emails/${created.id}/read`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { isRead: false },
  });
  expect(unread.status()).toBe(200);
  return { id: created.id as string, subject };
}

test.describe.configure({ mode: 'serial' });

test.describe('Productivity-first authenticated flows', () => {
  test('renders Smart Inbox sections and executes real quick actions', async ({ page }) => {
    const { token } = await registerAndToken(page);
    await createInboxFixture(page, token);
    await page.goto('/');
    await expect(page.getByRole('tablist', { name: /smart inbox sections/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /important/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /needs follow-up/i })).toBeVisible();
    await page.getByRole('tab', { name: /unread/i }).click();
    await expect(page.getByRole('tab', { name: /unread/i })).toHaveAttribute('aria-selected', 'true');
    const quickAction = page.getByRole('button', { name: /mark.*read|read.*message/i }).first();
    await expect(quickAction).toBeVisible();
    const request = page.waitForResponse((response) => response.request().method() === 'PATCH' && /\/api\/emails\/.+\/read$/.test(new URL(response.url()).pathname));
    await quickAction.click();
    expect((await request).status()).toBe(200);
  });

  test('loads the unified dashboard and converts a real message to a Task and Event', async ({ page }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    await page.goto('/workspace');
    await expect(page.getByRole('heading', { name: /your productivity workspace/i })).toBeVisible();
    await expect(page.getByText(fixture.subject, { exact: true })).toBeVisible();

    const taskRequest = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/productivity/tasks');
    await page.getByRole('button', { name: /create task/i }).first().click();
    expect((await taskRequest).status()).toBe(201);

    await page.getByText(fixture.subject, { exact: true }).click();
    await expect(page).toHaveURL(/email=/);
    await expect(page.getByRole('button', { name: /create event/i })).toBeVisible();
    await page.getByRole('button', { name: /create event/i }).click();
    await expect(page.locator('#email-event-title')).toBeVisible();
    await page.locator('#email-event-title').fill('Planning event');
    await page.locator('#email-event-start').fill('2026-08-25T10:00');
    await page.locator('#email-event-end').fill('2026-08-25T11:00');
    const eventRequest = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/productivity/calendar/events');
    await page.getByRole('button', { name: /save event/i }).click();
    expect((await eventRequest).status()).toBe(201);
  });

  test('applies visible global search filters through the real workspace API', async ({ page }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    await page.goto('/workspace');
    await page.getByText(fixture.subject, { exact: true }).waitFor();
    await page.getByText(/search filters/i).click();
    await page.getByLabel(/sender/i).fill('fixture-recipient@example.test');
    await page.getByLabel(/has attachments/i).check();
    await page.getByLabel(/priority/i).selectOption('high');
    const filteredResponse = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/productivity/workspace' && (new URL(response.url()).searchParams.get('q') ?? '').includes('from:'));
    await page.getByRole('button', { name: /apply filters/i }).click();
    expect((await filteredResponse).status()).toBe(200);
    await expect(page.getByText(/from:fixture-recipient@example.test/i)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('runs follow-up center actions and keeps Workspace keyboard-accessible', async ({ page }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    const created = await page.request.post('/api/productivity/follow-ups', {
      headers: { Authorization: `Bearer ${token}` },
      data: { emailId: fixture.id, remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), note: 'Follow up on the planning reply' },
    });
    expect(created.status()).toBe(201);
    await page.goto('/workspace');
    await expect(page.getByText(fixture.subject, { exact: true }).first()).toBeVisible();
    const snoozeRequest = page.waitForResponse((response) => response.request().method() === 'PATCH' && /\/api\/productivity\/follow-ups\/.+/.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: /snooze 1 day/i }).click();
    expect((await snoozeRequest).status()).toBe(200);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
  });

  test('exposes AI success/error/not-configured through the real endpoint contract', async ({ page }) => {
    const { token } = await registerAndToken(page);
    const fixture = await createInboxFixture(page, token);
    const unauthorized = await page.request.post(`/api/ai/insights/${fixture.id}`);
    expect(unauthorized.status()).toBe(401);
    const response = await page.request.post(`/api/ai/insights/${fixture.id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect([200, 503]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(typeof body.summary).toBe('string');
      expect(typeof body.needsFollowUp).toBe('boolean');
      expect(body.priority).toMatch(/^(low|normal|high)$/);
    } else {
      const body = await response.json();
      expect(String(body.error ?? body.message)).toMatch(/not configured|unavailable/i);
    }
    const invalid = await page.request.post('/api/ai/insights/not-a-real-email', { headers: { Authorization: `Bearer ${token}` } });
    expect(invalid.status()).toBe(404);
  });
});
