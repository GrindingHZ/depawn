import { expect, test } from '@playwright/test';

test('operations staff log in and see the admin app', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('ops@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('authenticated-home')).toBeVisible();
  await expect(page.getByTestId('account-email')).toHaveText('ops@demo.test');
});

test('a member is refused on the admin app', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('member@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('access-denied')).toBeVisible();
});
