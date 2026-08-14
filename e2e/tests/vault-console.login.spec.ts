import { expect, test } from '@playwright/test';

/* Staff roles cannot be created through the public API, so these tests use
   the seeded staff account from apps/api/prisma/seed.ts. */
test('vault staff log in and see the console', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('staff@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('authenticated-home')).toBeVisible();
  await expect(page.getByTestId('account-email')).toHaveText('staff@demo.test');
});

test('a member is refused on the vault console', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email-input').fill('member@demo.test');
  await page.getByTestId('password-input').fill('demo-password-123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('access-denied')).toBeVisible();
});
