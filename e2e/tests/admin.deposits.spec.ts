import { expect, test } from '@playwright/test';

const apiBase = 'http://localhost:3000/api/v1';
const marketplaceBase = 'http://localhost:5273';
const password = 'a-long-enough-password';

test('operations deposit funds and the member sees them in the wallet', async ({
  page,
  browser,
  request,
}) => {
  const memberEmail = `wallet-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  const registered = await request.post(`${apiBase}/auth/register`, {
    data: { email: memberEmail, password },
  });
  expect(registered.status()).toBe(201);

  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'Deposits' }).click();
  await page.getByTestId('deposit-email').fill(memberEmail);
  await page.getByTestId('deposit-amount').fill('2500.00');
  await page.getByTestId('deposit-submit').click();
  await expect(page.getByTestId('deposit-reference')).toBeVisible();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`${marketplaceBase}/login`);
  await memberPage.getByTestId('email-input').fill(memberEmail);
  await memberPage.getByTestId('password-input').fill(password);
  await memberPage.getByTestId('login-submit').click();
  await expect(memberPage.getByTestId('authenticated-home')).toBeVisible();

  await memberPage.getByRole('link', { name: 'Wallet' }).click();
  await expect(memberPage.getByTestId('available-balance')).toHaveText('AUD 2,500.00');
  await expect(memberPage.getByTestId('ledger-history')).toContainText('DEPOSIT');
  await memberContext.close();
});

test('a deposit to an unknown email shows an alert', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();

  await page.getByRole('link', { name: 'Deposits' }).click();
  await page.getByTestId('deposit-email').fill('nobody@example.test');
  await page.getByTestId('deposit-amount').fill('100.00');
  await page.getByTestId('deposit-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
});
