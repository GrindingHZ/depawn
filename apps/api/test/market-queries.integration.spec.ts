import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-MARKET-1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;
const oneHour = 60 * 60 * 1000;

interface Seed {
  readonly category: 'BULLION' | 'WATCH' | 'ART';
  readonly status?: 'ACTIVE' | 'DRAFT' | 'CANCELLED' | 'MATCHED';
  readonly description?: string;
}

describe('the market index and tape', () => {
  let harness: TestApplication;
  let accountId: string;
  let cookies: string[];
  let sequence = 0;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    sequence = 0;
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Market vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000_000n,
        currency: 'AUD',
      },
    });
    const email = `member-${randomUUID().slice(0, 8)}@market.test`;
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    cookies = login.get('Set-Cookie') ?? [];
    const account = await harness.prisma.account.findUnique({ where: { email } });
    accountId = account?.id ?? '';
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  function nowMs(): number {
    return Number(harness.clock.now().epochMilliseconds);
  }

  /* Rows written directly. This suite is about what the two queries report,
     not about how a listing came to exist, and driving each one through
     intake would bury the thing under test. */
  async function listingFrom(seed: Seed): Promise<string> {
    sequence += 1;
    const suffix = `${sequence}`.padStart(4, '0');
    const receiptId = `R-MARKET-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: accountId,
        intakeRecordHash: `hash-market-${suffix}`,
        appraisedValueMinorUnits: 1_000_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: seed.category,
        itemDescription: seed.description ?? `${seed.category} number ${sequence}`,
        insurancePolicyReference: 'POL-MARKET',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-MARKET-${suffix}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId: accountId,
        receiptId,
        requestedPrincipalMinorUnits: 500_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30n * BigInt(oneDay),
        expiresAt: new Date(nowMs() + 5 * oneDay),
        status: seed.status ?? 'ACTIVE',
      },
    });
    return listingId;
  }

  async function offerOn(listingId: string, basisPoints: number, offeredAgoMs = 0): Promise<void> {
    sequence += 1;
    const suffix = `${sequence}`.padStart(4, '0');
    await harness.prisma.offer.create({
      data: {
        id: `O-MARKET-${suffix}`,
        listingId,
        lenderAccountId: accountId,
        principalMinorUnits: 400_000n,
        currency: 'AUD',
        annualPercentageRateBasisPoints: basisPoints,
        durationMs: 30n * BigInt(oneDay),
        fundsHoldId: `H-MARKET-${suffix}`,
        expiresAt: new Date(nowMs() + 5 * oneDay),
        offeredAt: new Date(nowMs() - offeredAgoMs),
        status: 'PENDING',
      },
    });
  }

  async function index(query = ''): Promise<{
    categories: {
      category: string;
      liveListings: number;
      averageRateBasisPoints: number | null;
      previousAverageRateBasisPoints: number | null;
    }[];
    windowMs: number;
  }> {
    const response = await server()
      .get(`/api/v1/market/index${query}`)
      .set('Cookie', cookies)
      .expect(200);
    return response.body;
  }

  async function tape(query = ''): Promise<{
    events: { kind: string; listingId: string; itemDescription: string; rateBasisPoints: number }[];
  }> {
    const response = await server()
      .get(`/api/v1/market/tape${query}`)
      .set('Cookie', cookies)
      .expect(200);
    return response.body;
  }

  it('turns nobody away who is signed in, and refuses everybody who is not', async () => {
    await server().get('/api/v1/market/index').expect(401);
    await server().get('/api/v1/market/tape').expect(401);
  });

  it('reports one row per category that has a live listing', async () => {
    await listingFrom({ category: 'BULLION' });
    await listingFrom({ category: 'WATCH' });

    const body = await index();
    expect(body.categories.map((entry) => entry.category).sort()).toEqual(['BULLION', 'WATCH']);
    expect(body.categories.every((entry) => entry.liveListings === 1)).toBe(true);
  });

  /* A category nobody has bid in is not a category lending at nothing. */
  it('reports a null rate rather than zero when nothing has been offered', async () => {
    await listingFrom({ category: 'ART' });
    const body = await index();
    expect(body.categories[0]?.averageRateBasisPoints).toBeNull();
  });

  it('averages the best offer per listing, not every offer', async () => {
    const first = await listingFrom({ category: 'BULLION' });
    await offerOn(first, 1000);
    /* Three lenders queueing behind the cheap one do not make the category
       dearer, so the mean must stay at what a borrower would actually pay. */
    await offerOn(first, 2000);
    await offerOn(first, 2200);

    const second = await listingFrom({ category: 'BULLION' });
    await offerOn(second, 1400);

    const body = await index();
    expect(body.categories[0]?.averageRateBasisPoints).toBe(1200);
  });

  it('compares against what stood one window ago', async () => {
    const listing = await listingFrom({ category: 'WATCH' });
    await offerOn(listing, 1400, 3 * oneHour);
    await offerOn(listing, 1100, 0);

    const body = await index('?windowMs=3600000');
    expect(body.categories[0]?.averageRateBasisPoints).toBe(1100);
    expect(body.categories[0]?.previousAverageRateBasisPoints).toBe(1400);
  });

  it('has nothing to compare against when every offer is newer than the window', async () => {
    const listing = await listingFrom({ category: 'WATCH' });
    await offerOn(listing, 1100, 0);

    const body = await index('?windowMs=3600000');
    expect(body.categories[0]?.previousAverageRateBasisPoints).toBeNull();
  });

  it('ignores a listing that is not live', async () => {
    await listingFrom({ category: 'ART', status: 'DRAFT' });
    await listingFrom({ category: 'ART', status: 'CANCELLED' });
    expect((await index()).categories).toHaveLength(0);
  });

  it('falls back to the server window when asked for nonsense', async () => {
    await listingFrom({ category: 'BULLION' });
    expect((await index('?windowMs=-5')).windowMs).toBe(3_600_000);
    expect((await index('?windowMs=banana')).windowMs).toBe(3_600_000);
  });

  it('names the item on the tape rather than an identifier', async () => {
    const listing = await listingFrom({ category: 'WATCH', description: 'Rolex Submariner' });
    await offerOn(listing, 1120);

    const body = await tape();
    expect(body.events[0]?.itemDescription).toBe('Rolex Submariner');
    expect(body.events[0]?.kind).toBe('OFFER_PLACED');
  });

  it('puts the newest event first', async () => {
    const listing = await listingFrom({ category: 'WATCH' });
    await offerOn(listing, 1400, 2 * oneHour);
    await offerOn(listing, 1100, 0);

    const body = await tape();
    expect(body.events.map((event) => event.rateBasisPoints)).toEqual([1100, 1400]);
  });

  it('honours a limit and caps it', async () => {
    const listing = await listingFrom({ category: 'WATCH' });
    for (let index = 0; index < 5; index += 1) {
      await offerOn(listing, 1000 + index, index * 1000);
    }
    expect((await tape('?limit=2')).events).toHaveLength(2);
    expect((await tape('?limit=9999')).events).toHaveLength(5);
  });

  /* The tape must not become a directory of listings a reader could not
     otherwise see. A draft belongs to its borrower alone. */
  it('never mentions a listing that was never published', async () => {
    const draft = await listingFrom({ category: 'ART', status: 'DRAFT' });
    await offerOn(draft, 1500);

    expect((await tape()).events).toHaveLength(0);
  });

  /* A browse row reports the cheapest standing offer, and reports null when
     there is genuinely none. Without this the rail has to guess, and a row
     saying no offers because nothing was fetched tells the reader something
     untrue about a listing they might act on. */
  it('carries the best standing offer on a browse row', async () => {
    const listing = await listingFrom({ category: 'WATCH' });
    await offerOn(listing, 1400);
    await offerOn(listing, 1120);
    await offerOn(listing, 1800);

    const response = await server().get('/api/v1/listings').set('Cookie', cookies).expect(200);
    expect(response.body.items[0].bestOfferRateBasisPoints).toBe(1120);
  });

  it('reports no standing offer as null rather than as a rate', async () => {
    await listingFrom({ category: 'WATCH' });
    const response = await server().get('/api/v1/listings').set('Cookie', cookies).expect(200);
    expect(response.body.items[0].bestOfferRateBasisPoints).toBeNull();
  });
});
