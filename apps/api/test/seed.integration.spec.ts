import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* The demo seed is an exit criterion of P8, so it is tested the way it is
   run: as a whole script against an empty database, with the assertions
   made on what it left behind rather than on how it got there. */
describe('the demo seed', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  const apiRoot = path.resolve(__dirname, '..');

  function runInApi(command: string, args: readonly string[], databaseUrl: string): void {
    execFileSync(command, [...args], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('depawn_seed')
      .withUsername('depawn')
      .withPassword('depawn')
      .start();
    const databaseUrl = container.getConnectionUri();
    runInApi('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], databaseUrl);
    runInApi('pnpm', ['run', 'db:seed'], databaseUrl);
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  }, 300_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('fills the vault with inventory an operator can see', async () => {
    expect(await prisma.custodyReceipt.count()).toBe(8);
    const vault = await prisma.vault.findUnique({ where: { id: 'VAULT-DEMO-1' } });
    expect(vault?.city).toBe('Sydney');
  });

  it('leaves live listings with competing offers on each', async () => {
    const live = await prisma.listing.findMany({ where: { status: 'ACTIVE' } });
    expect(live.length).toBeGreaterThanOrEqual(3);
    for (const listing of live) {
      const offers = await prisma.offer.count({ where: { listingId: listing.id } });
      expect(offers).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves loans at more than one distance from maturity', async () => {
    const active = await prisma.loan.findMany({ where: { status: 'ACTIVE' } });
    expect(active.length).toBeGreaterThanOrEqual(2);
    const maturities = new Set(active.map((loan) => loan.maturesAt.getTime()));
    expect(maturities.size).toBe(active.length);
  });

  it('leaves one completed cycle and one sale under way', async () => {
    expect(await prisma.loan.count({ where: { status: 'REPAID' } })).toBe(1);
    expect(await prisma.custodyReceipt.count({ where: { status: 'RELEASED' } })).toBe(1);

    const defaulted = await prisma.loan.findMany({ where: { status: 'DEFAULTED' } });
    expect(defaulted).toHaveLength(1);
    const liquidations = await prisma.liquidation.findMany({ where: { status: 'BIDDING' } });
    expect(liquidations).toHaveLength(1);
    const sale = liquidations[0];
    if (sale === undefined) {
      throw new Error('the seed must leave one sale taking bids');
    }
    expect(await prisma.liquidationBid.count({ where: { liquidationId: sale.id } })).toBe(2);
  });

  /* The seed moves the clock to spread the book across weeks. If it left the
     offset behind, the api serving the demo would be born in the future and
     every date on screen would be wrong. */
  it('leaves every date in the past and no loan already matured by accident', async () => {
    const loans = await prisma.loan.findMany();
    for (const loan of loans) {
      expect(loan.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
    const active = await prisma.loan.findMany({ where: { status: 'ACTIVE' } });
    for (const loan of active) {
      expect(loan.maturesAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('balances the ledger it wrote', async () => {
    const rows = await prisma.$queryRaw<{ net: bigint | null }[]>`
      SELECT SUM(CASE WHEN direction = 'DEBIT' THEN minor_units ELSE -minor_units END) AS net
      FROM ledger_entry
    `;
    expect(rows[0]?.net ?? 0n).toBe(0n);
  });

  it('can be run again without stacking a second story on the first', async () => {
    runInApi('pnpm', ['run', 'db:seed'], container.getConnectionUri());
    expect(await prisma.custodyReceipt.count()).toBe(8);
    expect(await prisma.loan.count({ where: { status: 'REPAID' } })).toBe(1);
  }, 300_000);
});
