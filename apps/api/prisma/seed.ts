import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { ulid } from 'ulid';
import { loadConfiguration } from '../src/config/configuration';
import { solidPng } from '../src/infrastructure/storage/solid-png';

export const demoPassword = 'demo-password-123';

const staffEmail = 'staff@demo.test';
const operationsEmail = 'ops@demo.test';
const vaultId = 'VAULT-DEMO-1';
const oneDay = 24 * 60 * 60 * 1000;

const demoAccounts = [
  { email: 'member@demo.test', roles: ['MEMBER'] },
  { email: 'lender@demo.test', roles: ['MEMBER'] },
  { email: staffEmail, roles: ['VAULT_STAFF'] },
  { email: operationsEmail, roles: ['OPERATIONS'] },
  { email: 'compliance@demo.test', roles: ['COMPLIANCE'] },
] as const;

/* Everyone the story needs, beyond the five fixed accounts the e2e suite
   signs in as. Each has one job so the runbook can name them. */
const cast = {
  ada: 'ada@demo.test',
  bruno: 'bruno@demo.test',
  chen: 'chen@demo.test',
  dara: 'dara@demo.test',
  elena: 'elena@demo.test',
  farid: 'farid@demo.test',
  gita: 'gita@demo.test',
} as const;

/* One of each category the vault takes, so the demo shows the loan to value
   caps actually differing rather than five rows of gold. The tint stands in
   for a photograph: the seed generates a real PNG per item, because the
   upload check verifies the bytes and would refuse anything else. */
interface Item {
  readonly description: string;
  readonly category: 'BULLION' | 'WATCH' | 'JEWELLERY' | 'COLLECTIBLE' | 'ART';
  readonly appraisedMinorUnits: string;
  readonly tint: readonly [number, number, number];
  /* Comfortably inside the category cap, so the demo never has to explain a
     refusal it did not mean to show. */
  readonly askMinorUnits: string;
}

const items: readonly Item[] = [
  {
    description: 'One kilogram gold bar, cast',
    category: 'BULLION',
    appraisedMinorUnits: '500000',
    askMinorUnits: '250000',
    tint: [201, 153, 47],
  },
  {
    description: 'Steel chronograph, box and papers',
    category: 'WATCH',
    appraisedMinorUnits: '900000',
    askMinorUnits: '200000',
    tint: [92, 105, 118],
  },
  {
    description: 'Two carat solitaire ring, certificated',
    category: 'JEWELLERY',
    appraisedMinorUnits: '600000',
    askMinorUnits: '150000',
    tint: [176, 186, 201],
  },
  {
    description: 'Sealed first print trading card, graded',
    category: 'COLLECTIBLE',
    appraisedMinorUnits: '300000',
    askMinorUnits: '90000',
    tint: [138, 106, 168],
  },
  {
    description: 'Signed screenprint, edition of fifty',
    category: 'ART',
    appraisedMinorUnits: '400000',
    askMinorUnits: '100000',
    tint: [163, 106, 82],
  },
  {
    description: 'Ten ounce gold bar, minted',
    category: 'BULLION',
    appraisedMinorUnits: '700000',
    askMinorUnits: '150000',
    tint: [212, 168, 68],
  },
  {
    description: 'Titanium diver, service history',
    category: 'WATCH',
    appraisedMinorUnits: '450000',
    askMinorUnits: '150000',
    tint: [74, 88, 99],
  },
  {
    description: 'Antique emerald brooch',
    category: 'JEWELLERY',
    appraisedMinorUnits: '250000',
    askMinorUnits: '100000',
    tint: [96, 140, 116],
  },
];

/* The seed drives the same HTTP surface the three apps drive rather than
   writing rows. A seed that wrote rows would encode today's shape of the
   schema and would rot the first time a rule changed; this one cannot produce
   a state the product could not have reached by itself. */
class DemoClient {
  private cookie = '';

  constructor(private readonly origin: string) {}

  async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        ...(this.cookie === '' ? {} : { cookie: this.cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      this.cookie = setCookie.split(';')[0] ?? this.cookie;
    }
    const text = await response.text();
    if (response.status >= 400) {
      throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    }
    return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
  }

  async uploadPhoto(intakeId: string, bytes: Buffer): Promise<void> {
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'front.png');
    const response = await fetch(`${this.origin}/api/v1/intakes/${intakeId}/photos`, {
      method: 'POST',
      headers: this.cookie === '' ? {} : { cookie: this.cookie },
      body: form,
    });
    if (response.status >= 400) {
      throw new Error(`photo upload answered ${response.status}: ${await response.text()}`);
    }
  }

  async signIn(email: string, secret: string): Promise<void> {
    await this.call('POST', '/auth/login', { email, password: secret });
  }
}

/* The seed wipes what it finds, so it refuses to run against anything that
   looks like it is not a development or demo database. A wrong DATABASE_URL
   is the one mistake this script could make that could not be undone. */
function refuseToWipeAnythingImportant(databaseUrl: string): void {
  const host = new URL(databaseUrl).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && process.env.SEED_ANY_DATABASE !== 'true') {
    throw new Error(
      `refusing to empty a database on ${host}. The seed only ever runs locally; ` +
        'set SEED_ANY_DATABASE=true if you truly mean a remote one.',
    );
  }
}

/* The database and the blob store have to be emptied together. Emptying only
   the tables leaves every photograph any previous run wrote sitting on disk
   with nothing pointing at it, which after a few dozen runs is most of what
   is in there. */
async function emptyStoredObjects(storageDirectory: string): Promise<void> {
  await rm(path.resolve(storageDirectory, 'intakes'), { recursive: true, force: true });
}

async function emptyEveryTable(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) {
    return;
  }
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
}

function identifierOf(payload: Record<string, unknown>): string {
  const id = payload.id;
  if (typeof id !== 'string') {
    throw new Error('the api must answer a created resource with an id');
  }
  return id;
}

/* Every deadline in the dataset is measured against the api's clock, not the
   seed's. They part company the moment the seed advances time, and a listing
   dated from the seed's own clock would be born already expired. */
let clockOffsetMs = 0;

function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

function money(minorUnits: string): { minorUnits: string; currency: 'AUD' } {
  return { minorUnits, currency: 'AUD' };
}

/* The end to end suite wants the fixed accounts and the vault and nothing
   else: its specs build their own data, and a loan book dated against a clock
   that suite does not run would only confuse it. A demo wants the whole
   story. One script, two scopes, so there is only ever one place that knows
   what a demo account is called. */
const accountsOnly = process.argv.includes('--accounts-only');

/* For a container that starts on every `docker compose up`. Seeding an empty
   database is helpful; emptying a full one because the stack restarted is
   not, and belongs behind a deliberate `pnpm db:seed`. */
const onlyIfEmpty = process.argv.includes('--if-empty');

async function main(): Promise<void> {
  process.env.DEMO_MODE = 'true';
  const configuration = loadConfiguration();
  const prisma = new PrismaClient({ datasourceUrl: configuration.databaseUrl });

  if (onlyIfEmpty && (await prisma.account.count()) > 0) {
    process.stdout.write('the database already has accounts, so the seed left it alone\n');
    await prisma.$disconnect();
    return;
  }
  refuseToWipeAnythingImportant(configuration.databaseUrl);

  /* The dataset is a story with a fixed cast, so it starts from an empty
     database. Seeding on top of a previous run would double the loan book
     and leave the runbook describing a screen nobody can reproduce. */
  await emptyEveryTable(prisma);
  await emptyStoredObjects(configuration.storageDirectory);
  const passwordHash = await hash(demoPassword);

  for (const account of demoAccounts) {
    await prisma.account.upsert({
      where: { email: account.email },
      update: { roles: [...account.roles] },
      create: { id: ulid(), email: account.email, passwordHash, roles: [...account.roles] },
    });
  }

  await prisma.vault.upsert({
    where: { id: vaultId },
    update: {},
    create: {
      id: vaultId,
      name: 'Sydney vault',
      city: 'Sydney',
      insuredLimitMinorUnits: 100_000_000n,
      currency: 'AUD',
    },
  });

  if (accountsOnly) {
    await prisma.$disconnect();
    process.stdout.write('seeded the demo accounts and the Sydney vault\n');
    return;
  }

  // Imported here so the demo mode flag above is already set when the graph
  // decides which clock it runs.
  const { NestFactory } = await import('@nestjs/core');
  const cookieParser = (await import('cookie-parser')).default;
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  process.stdout.write(`listening on ${origin}
`);
  try {
    await buildDataset(origin);
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

interface Receipt {
  readonly id: string;
  readonly borrower: string;
  readonly ask: string;
}

async function buildDataset(origin: string): Promise<void> {
  const clock = new DemoClient(origin);
  const staff = new DemoClient(origin);
  const operations = new DemoClient(origin);

  for (const email of Object.values(cast)) {
    await new DemoClient(origin).call('POST', '/auth/register', { email, password: demoPassword });
  }
  await staff.signIn(staffEmail, demoPassword);
  await operations.signIn(operationsEmail, demoPassword);

  const borrowers = [cast.ada, cast.bruno, cast.chen, cast.dara, cast.elena, cast.farid, cast.gita];
  const receipts: Receipt[] = [];
  for (const [index, item] of items.entries()) {
    const borrower = borrowers[index % borrowers.length] ?? cast.ada;
    receipts.push({
      id: await issueReceipt(staff, borrower, item),
      borrower,
      ask: item.askMinorUnits,
    });
  }
  const receiptAt = (index: number): Receipt => {
    const receipt = receipts[index];
    if (receipt === undefined) {
      throw new Error(`the seed expects a receipt at position ${index}`);
    }
    return receipt;
  };

  // Enough for every lender and bidder to cover what the story asks of them.
  for (const email of Object.values(cast)) {
    await operations.call('POST', '/me/deposits', { email, amount: money('2000000') });
  }

  const staffAndOperations = [
    [staff, staffEmail],
    [operations, operationsEmail],
  ] as const;

  /* Order matters more than it looks. Everything that needs time to pass goes
     first, because the clock only runs forwards: a loan originated before the
     jumps would be aged out by them. The loans meant to be still running are
     therefore written last, after the clock has finished moving. */

  /* The completed cycle: borrowed, repaid, and the item walked back out of
     the vault, so the demo can show the whole arc without waiting. */
  const repaid = await originate(origin, receiptAt(0), 1800, 30);
  await advance(clock, 5 * oneDay, staffAndOperations);
  await repay(origin, repaid);
  await redeem(origin, staff, repaid.borrower, receiptAt(0).id);

  /* The defaulted loan, mid sale with two bids against it. Fourteen days to
     maturity plus seven of grace plus the statutory holding period is what
     stands between origination and a sale that is allowed to happen. */
  const defaulted = await originate(origin, receiptAt(1), 2400, 14);
  await advance(clock, 22 * oneDay, staffAndOperations);
  const lender = new DemoClient(origin);
  await lender.signIn(defaulted.lender, demoPassword);
  await lender.call('POST', `/loans/${defaulted.loanId}/default`, {});
  await advance(clock, 31 * oneDay, staffAndOperations);
  const scheduled = await operations.call('POST', `/loans/${defaulted.loanId}/liquidations`, {
    reservePrice: money('150000'),
  });
  const liquidationId = identifierOf(scheduled);
  await operations.call('POST', `/liquidations/${liquidationId}/open`, {
    biddingWindowMs: 7 * oneDay,
  });
  for (const [bidder, amount] of [
    [cast.farid, '180000'],
    [cast.gita, '210000'],
  ] as const) {
    const client = new DemoClient(origin);
    await client.signIn(bidder, demoPassword);
    await client.call('POST', `/liquidations/${liquidationId}/bids`, { amount: money(amount) });
  }

  /* Three running loans at three distances from maturity, so the loan book
     has a near term, a mid term, and a long one rather than a single date. */
  const active: SeededLoan[] = [];
  for (const [index, durationDays] of [14, 45, 90].entries()) {
    active.push(await originate(origin, receiptAt(2 + index), 1500 + index * 300, durationDays));
  }

  // Three listings taking offers, so the marketplace is not an empty table.
  for (const [index, receipt] of receipts.slice(5).entries()) {
    const listingId = await publishListing(origin, receipt, 30);
    await placeOffer(
      origin,
      listingId,
      borrowers[(index + 2) % borrowers.length] ?? cast.ada,
      1600,
    );
    await placeOffer(
      origin,
      listingId,
      borrowers[(index + 4) % borrowers.length] ?? cast.bruno,
      2000,
    );
  }

  /* The offsets were the only way to spread a loan book across weeks, since a
     clock that cannot run backwards cannot be asked for history. They are
     deliberately not reset: in demo mode the offset is written down, so the
     process that serves the demo is born at the same instant this one ends
     at, and every date the seed wrote sits in its past. */

  process.stdout.write(
    `seeded ${receipts.length} receipts, ${active.length} active loans, ` +
      `one repaid and redeemed, one in liquidation with two bids\n`,
  );
}

/* Sessions expire against the same clock the seed is moving, so the two long
   lived clients sign in again on the other side of every jump. */
async function advance(
  clock: DemoClient,
  milliseconds: number,
  reconnect: readonly (readonly [DemoClient, string])[] = [],
): Promise<void> {
  await clock.call('POST', '/test/clock/advance', { milliseconds });
  clockOffsetMs += milliseconds;
  for (const [client, email] of reconnect) {
    await client.signIn(email, demoPassword);
  }
}

async function issueReceipt(staff: DemoClient, borrowerEmail: string, item: Item): Promise<string> {
  const begun = await staff.call('POST', `/vaults/${vaultId}/intakes`, {
    borrowerEmail,
    itemCategory: item.category,
    itemDescription: item.description,
  });
  const intakeId = identifierOf(begun);
  await staff.call('PATCH', `/intakes/${intakeId}`, {
    sealNumber: `SEAL-${randomUUID().slice(0, 8)}`,
  });
  await staff.uploadPhoto(intakeId, solidPng(160, 160, item.tint));
  await staff.call('POST', `/intakes/${intakeId}/appraisals`, {
    value: money(item.appraisedMinorUnits),
    method: 'comparable sales',
    comparableReferences: 'internal register',
  });
  await staff.call('POST', `/intakes/${intakeId}/seal`, {});
  const issued = await staff.call('POST', `/intakes/${intakeId}/issue-receipt`, {
    insurancePolicyReference: 'POL-DEMO',
  });
  return identifierOf(issued);
}

async function publishListing(
  origin: string,
  receipt: Receipt,
  durationDays: number,
  maxRateBasisPoints = 2400,
): Promise<string> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(receipt.borrower, demoPassword);
  const listing = await borrower.call('POST', '/listings', {
    receiptId: receipt.id,
    requestedPrincipal: money(receipt.ask),
    maxAnnualPercentageRateBasisPoints: maxRateBasisPoints,
    requestedDurationMs: durationDays * oneDay,
    expiresAt: new Date(serverNow() + 14 * oneDay).toISOString(),
  });
  const listingId = identifierOf(listing);
  await borrower.call('POST', `/listings/${listingId}/publish`, {});
  return listingId;
}

async function placeOffer(
  origin: string,
  listingId: string,
  lenderEmail: string,
  rateBasisPoints: number,
): Promise<string> {
  const lender = new DemoClient(origin);
  await lender.signIn(lenderEmail, demoPassword);
  const listing = await lender.call('GET', `/listings/${listingId}`);
  const principal = listing.requestedPrincipal as { minorUnits: string };
  const durationMs = Number(listing.requestedDurationMs);
  const offer = await lender.call('POST', `/listings/${listingId}/offers`, {
    principal: money(principal.minorUnits),
    annualPercentageRateBasisPoints: rateBasisPoints,
    durationMs,
    expiresAt: new Date(serverNow() + 7 * oneDay).toISOString(),
  });
  return identifierOf(offer);
}

interface SeededLoan {
  readonly loanId: string;
  readonly borrower: string;
  readonly lender: string;
}

async function originate(
  origin: string,
  receipt: Receipt,
  rateBasisPoints: number,
  durationDays: number,
): Promise<SeededLoan> {
  /* The ceiling leaves room for the losing offer, so the demo shows a
     borrower choosing rather than accepting the only thing on the table. */
  const losingRate = rateBasisPoints + 300;
  const listingId = await publishListing(origin, receipt, durationDays, losingRate);
  const lenderEmail = receipt.borrower === cast.ada ? cast.gita : cast.ada;
  await placeOffer(origin, listingId, cast.elena, losingRate);
  const offerId = await placeOffer(origin, listingId, lenderEmail, rateBasisPoints);

  const borrower = new DemoClient(origin);
  await borrower.signIn(receipt.borrower, demoPassword);
  const accepted = await borrower.call(
    'POST',
    `/listings/${listingId}/offers/${offerId}/accept`,
    {},
  );
  return { loanId: identifierOf(accepted), borrower: receipt.borrower, lender: lenderEmail };
}

async function repay(origin: string, loan: SeededLoan): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(loan.borrower, demoPassword);
  const quote = await borrower.call('GET', `/loans/${loan.loanId}/payoff-quote`);
  const amount = quote.total as { minorUnits: string };
  await borrower.call('POST', `/loans/${loan.loanId}/repay`, {
    amount: money(amount.minorUnits),
    quotedAt: quote.quotedAt,
  });
}

async function redeem(
  origin: string,
  staff: DemoClient,
  borrowerEmail: string,
  receiptId: string,
): Promise<void> {
  const borrower = new DemoClient(origin);
  await borrower.signIn(borrowerEmail, demoPassword);
  const requested = await borrower.call('POST', `/receipts/${receiptId}/redemption-requests`, {});
  const requestId = identifierOf(requested);
  await staff.call('POST', `/redemption-requests/${requestId}/verify`, {});
  await staff.call('POST', `/redemption-requests/${requestId}/release`, {
    sealNumberBroken: `SEAL-${randomUUID().slice(0, 8)}`,
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}
`);
  process.exitCode = 1;
});
