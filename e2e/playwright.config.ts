import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'marketplace',
      testMatch: /marketplace\..*\.spec\.ts/,
      testIgnore: /marketplace\.(repayment|default)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5273' },
    },
    {
      name: 'vault-console',
      testMatch: /vault-console\..*\.spec\.ts/,
      testIgnore: /vault-console\.redemption\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      name: 'admin',
      testMatch: /admin\..*\.spec\.ts/,
      testIgnore: /admin\.(liquidation|pause|reconciliation)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
    /* Redeeming burns a receipt, which is the only thing in the suite that
       lowers vault exposure. The intake spec reads that figure before and
       after its own work, so the two must not overlap. */
    {
      name: 'vault-console-redemption',
      testMatch: /vault-console\.redemption\.spec\.ts/,
      dependencies: ['marketplace', 'vault-console', 'admin'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    /* One api process serves every project, so a spec that moves its clock
       would age out the listings and offers other specs are mid way through.
       Time travel therefore runs alone, after everything else, and puts the
       clock back when it is done (Q-016). */
    {
      name: 'marketplace-time-travel',
      testMatch: /marketplace\.repayment\.spec\.ts/,
      dependencies: ['marketplace', 'vault-console', 'admin', 'vault-console-redemption'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5273' },
    },
    /* Two specs that both move the one clock cannot share a project either,
       because files inside a project still run on separate workers. */
    {
      name: 'marketplace-default',
      testMatch: /marketplace\.default\.spec\.ts/,
      dependencies: ['marketplace-time-travel'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5273' },
    },
    /* Reconciliation reads the whole vault and the whole ledger, so it runs
       after the specs that are still moving both. */
    {
      name: 'admin-reconciliation',
      testMatch: /admin\.reconciliation\.spec\.ts/,
      dependencies: ['admin-pause'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
    /* Pausing is process wide, so it runs alone after everything else and
       turns itself back off. */
    {
      name: 'admin-pause',
      testMatch: /admin\.pause\.spec\.ts/,
      dependencies: ['admin-liquidation'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
    {
      name: 'admin-liquidation',
      testMatch: /admin\.liquidation\.spec\.ts/,
      dependencies: ['marketplace-default'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @depawn/api start',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      // Mounts the test only clock route so a spec can push a loan past
      // maturity. Set here rather than as a shell prefix, which would not
      // survive every platform this runs on.
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'pnpm --filter @depawn/marketplace dev',
      url: 'http://localhost:5273',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @depawn/vault-console dev',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @depawn/admin dev',
      url: 'http://localhost:5175',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
