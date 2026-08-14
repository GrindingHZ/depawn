import { execSync } from 'node:child_process';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '..');

function run(command: string): void {
  execSync(command, { cwd: repositoryRoot, stdio: 'inherit' });
}

export default function globalSetup(): void {
  run('docker compose up -d postgres');
  run('pnpm --filter @depawn/api db:deploy');
  run('pnpm --filter @depawn/api db:seed');
}
