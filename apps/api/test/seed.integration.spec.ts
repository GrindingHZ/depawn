import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
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

  /* The seed moves the clock to spread the book across weeks, and writes the
     offset down so the process that serves the demo starts where the seed
     finished. Read against that clock every date the seed wrote is in the
     past, and the loans it left active have not matured. Read against the
     wall clock they would all appear to start in the future, which is the
     bug this asserts is absent. */
  it('hands the serving process a clock its own dataset makes sense against', async () => {
    const row = await prisma.demoClock.findUnique({ where: { id: 'DEMO' } });
    const seededNow = Date.now() + Number(row?.offsetMs ?? 0n);
    expect(seededNow).toBeGreaterThan(Date.now());

    for (const loan of await prisma.loan.findMany()) {
      expect(loan.startedAt.getTime()).toBeLessThanOrEqual(seededNow);
    }
    for (const loan of await prisma.loan.findMany({ where: { status: 'ACTIVE' } })) {
      expect(loan.maturesAt.getTime()).toBeGreaterThan(seededNow);
    }
    for (const listing of await prisma.listing.findMany({ where: { status: 'ACTIVE' } })) {
      expect(listing.expiresAt.getTime()).toBeGreaterThan(seededNow);
    }
  });

  it('balances the ledger it wrote', async () => {
    const rows = await prisma.$queryRaw<{ net: bigint | number | null }[]>`
      SELECT SUM(CASE WHEN direction = 'DEBIT' THEN minor_units ELSE -minor_units END) AS net
      FROM ledger_entry
    `;
    expect(BigInt(rows[0]?.net ?? 0)).toBe(0n);
  });

  it('can be run again without stacking a second story on the first', async () => {
    runInApi('pnpm', ['run', 'db:seed'], container.getConnectionUri());
    expect(await prisma.custodyReceipt.count()).toBe(8);
    expect(await prisma.loan.count({ where: { status: 'REPAID' } })).toBe(1);
  }, 300_000);
});

/* The exit criterion for P8 is that `pnpm db:seed && pnpm dev` reaches a
   demo ready state. The seed and the serving process are two processes, and
   the clock the seed moved lives in the first one, so the only way to know
   the criterion holds is to start the second one and ask it. This starts the
   real dev entry point against the seeded database and reads it over HTTP. */
describe('a demo process serving the seeded dataset', () => {
  let container: StartedPostgreSqlContainer;
  let api: ChildProcess;
  let origin: string;
  let cookie = '';
  const apiRoot = path.resolve(__dirname, '..');
  // Away from the 3000 the development api uses, so a running one is safe.
  const port = 3771;

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie === '' ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      cookie = setCookie.split(';')[0] ?? cookie;
    }
    return response;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('depawn_demo')
      .withUsername('depawn')
      .withPassword('depawn')
      .start();
    const databaseUrl = container.getConnectionUri();
    const environment = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' };
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: environment,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    execFileSync('pnpm', ['run', 'db:seed'], {
      cwd: apiRoot,
      env: environment,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    /* src/dev.ts is what `pnpm dev` runs, so this is the criterion as
       written rather than an approximation of it. */
    api = spawn(process.execPath, ['-r', '@swc-node/register', 'src/dev.ts'], {
      cwd: apiRoot,
      env: { ...environment, PORT: String(port) },
      stdio: 'ignore',
    });
    origin = `http://127.0.0.1:${port}`;

    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const health = await fetch(`${origin}/api/v1/health`);
        if (health.ok) {
          break;
        }
      } catch {
        // Not listening yet.
      }
      if (Date.now() > deadline) {
        throw new Error('the demo process never started listening');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, 300_000);

  afterAll(async () => {
    api.kill();
    await container.stop();
  });

  it('reports that it is a demo process, so the clock control appears', async () => {
    const health = (await (await call('GET', '/health')).json()) as {
      status: string;
      demoMode: boolean;
      now: string;
    };
    expect(health.status).toBe('ok');
    expect(health.demoMode).toBe(true);
    // It says so on the way out, which is how anything else notices.
    expect(Date.parse(health.now)).toBeGreaterThan(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });

  /* The whole point of writing the offset down. A process that read the
     system clock instead would see every seeded loan starting weeks in the
     future and the book would be nonsense. */
  it('starts at the instant the seed finished at, not at real time', async () => {
    const advanced = await call('POST', '/test/clock/advance', { milliseconds: 1 });
    expect(advanced.status).toBe(201);
    const now = Date.parse(((await advanced.json()) as { now: string }).now);
    expect(now).toBeGreaterThan(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });

  it('serves a loan book that makes sense against its own clock', async () => {
    const signIn = await call('POST', '/auth/login', {
      email: 'ops@demo.test',
      password: 'demo-password-123',
    });
    expect(signIn.status).toBe(200);

    const book = (await (await call('GET', '/admin/loan-book')).json()) as {
      outstandingCount: number;
      overdueCount: number;
      defaultedCount: number;
    };
    // Three loans running and none of them overdue: the clock the process
    // inherited is the one the seed wrote those dates against. Read against
    // real time every one of them would be counted as not yet started.
    expect(book.outstandingCount).toBe(3);
    expect(book.overdueCount).toBe(0);
    expect(book.defaultedCount).toBe(1);
  });

  it('shows the story the runbook walks: live listings and a sale taking bids', async () => {
    const listings = (await (await call('GET', '/listings')).json()) as { items: unknown[] };
    expect(listings.items.length).toBeGreaterThanOrEqual(3);

    const sales = (await (await call('GET', '/liquidations')).json()) as {
      items: { status: string; highestBid: unknown }[];
    };
    const bidding = sales.items.filter((sale) => sale.status === 'BIDDING');
    expect(bidding).toHaveLength(1);
    expect(bidding[0]?.highestBid).not.toBeNull();
  });
});
