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
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5273' },
    },
    {
      name: 'vault-console',
      testMatch: /vault-console\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      name: 'admin',
      testMatch: /admin\..*\.spec\.ts/,
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
