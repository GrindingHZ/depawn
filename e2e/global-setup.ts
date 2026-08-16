import { execSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '..');

function run(command: string): void {
  execSync(command, { cwd: repositoryRoot, stdio: 'inherit' });
}

/* Start from an empty database every run. Specs create their own accounts,
   but the vault and its insured limit are shared by all of them, so receipts
   left behind by earlier runs eventually fill it and intake begins refusing
   items for reasons that have nothing to do with the code under test. */
/* Playwright reuses an api that is already listening. A process started by
   `pnpm dev` runs in demo mode with its clock weeks ahead, and every deadline
   this suite writes would be in that clock's past, so listings would be born
   expired and the failures would point anywhere but here. Say so instead. */
async function refuseAnApiRunningInTheFuture(): Promise<void> {
  let health: { now?: string } | null;
  try {
    const response = await fetch('http://localhost:3000/api/v1/health');
    health = response.ok ? ((await response.json()) as { now?: string }) : null;
  } catch {
    // Nothing listening yet, which is the ordinary case.
    return;
  }
  if (health?.now === undefined) {
    return;
  }
  const driftMs = Math.abs(Date.parse(health.now) - Date.now());
  if (driftMs > 60 * 60 * 1000) {
    throw new Error(
      `An api is already listening on port 3000 and its clock reads ${health.now}, ` +
        `which is ${Math.round(driftMs / 86_400_000)} days from now. That is a demo process. ` +
        'Stop `pnpm dev` before running the end to end suite.',
    );
  }
}

export default async function globalSetup(): Promise<void> {
  await refuseAnApiRunningInTheFuture();
  run('docker compose up -d postgres');
  run('pnpm --filter @depawn/api db:deploy');
  run('pnpm --filter @depawn/api db:truncate');
  /* The accounts and the vault only. The full demo dataset is dated against
     the persisted demo clock, which this suite does not run, so seeding it
     here would put a loan book in front of specs measuring time themselves.
     The full seed is proved by test/seed.integration.spec.ts instead. */
  run('pnpm --filter @depawn/api db:seed:accounts');
}
