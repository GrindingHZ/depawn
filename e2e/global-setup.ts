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
export default function globalSetup(): void {
  run('docker compose up -d postgres');
  run('pnpm --filter @depawn/api db:deploy');
  run('pnpm --filter @depawn/api db:truncate');
  run('pnpm --filter @depawn/api db:seed');
}
