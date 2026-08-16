import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* P8 asks for axe green on the primary routes. Serious and critical only:
   the lower two severities are largely advisory and a suite that fails on
   them gets muted, which is worse than not having it. Signed in routes are
   included, because an empty login screen is the one page nobody uses. */

const marketplaceBase = 'http://localhost:5273';
const vaultConsoleBase = 'http://localhost:5174';
const adminBase = 'http://localhost:5175';
const staffPassword = 'demo-password-123';

async function signIn(page: Page, email: string): Promise<void> {
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(staffPassword);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('authenticated-home')).toBeVisible();
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  // Named rather than counted, so a failure says which rule and where.
  expect(
    serious.map(
      (violation) => `${violation.id}: ${violation.nodes.map((n) => n.target).join(' ')}`,
    ),
  ).toEqual([]);
}

const routes = [
  { app: 'marketplace', base: marketplaceBase, email: 'member@demo.test', paths: ['/', '/browse'] },
  {
    app: 'vault console',
    base: vaultConsoleBase,
    email: 'staff@demo.test',
    paths: ['/', '/intake', '/inventory', '/releases'],
  },
  {
    app: 'admin',
    base: adminBase,
    email: 'ops@demo.test',
    paths: ['/', '/operations', '/parameters', '/reconciliation', '/liquidations', '/deposits'],
  },
] as const;

for (const route of routes) {
  test(`the ${route.app} login screen is free of serious accessibility faults`, async ({
    page,
  }) => {
    await page.goto(`${route.base}/login`);
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test(`the ${route.app} primary routes are free of serious accessibility faults`, async ({
    page,
  }) => {
    await page.goto(`${route.base}/login`);
    await signIn(page, route.email);
    for (const path of route.paths) {
      await page.goto(`${route.base}${path}`);
      // Wait for the first paint of real content rather than a skeleton.
      await page.waitForLoadState('networkidle');
      await expectNoSeriousViolations(page);
    }
  });
}
