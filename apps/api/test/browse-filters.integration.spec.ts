import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-BROWSE-1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

describe('browsing the marketplace', () => {
  let harness: TestApplication;
  let borrowerAccountId: string;
  let cookies: string[];

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Browse vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000_000n,
        currency: 'AUD',
      },
    });
    const email = `borrower-${randomUUID().slice(0, 8)}@browse.test`;
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    cookies = login.get('Set-Cookie') ?? [];
    const account = await harness.prisma.account.findUnique({ where: { email } });
    borrowerAccountId = account?.id ?? '';
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  interface Seed {
    readonly category: 'BULLION' | 'WATCH' | 'ART';
    readonly appraised: bigint;
    readonly principal: bigint;
    readonly maxRateBasisPoints: number;
    readonly expiresInDays: number;
  }

  /* Rows are written directly here. This suite is about which listings the
     query returns and in what order, not about how they came to exist, and
     driving eight of them through intake would bury that. */
  async function listingFrom(seed: Seed, index: number): Promise<string> {
    const suffix = `${index}`.padStart(4, '0');
    const receiptId = `R-BROWSE-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrowerAccountId,
        intakeRecordHash: `hash-browse-${suffix}`,
        appraisedValueMinorUnits: seed.appraised,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: seed.category,
        itemDescription: `${seed.category} number ${index}`,
        insurancePolicyReference: 'POL-BROWSE',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-BROWSE-${suffix}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId,
        receiptId,
        requestedPrincipalMinorUnits: seed.principal,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: seed.maxRateBasisPoints,
        requestedDurationMs: 30n * BigInt(oneDay),
        expiresAt: new Date(
          Number(harness.clock.now().epochMilliseconds) + seed.expiresInDays * oneDay,
        ),
        status: 'ACTIVE',
      },
    });
    return listingId;
  }

  async function browse(
    query = '',
  ): Promise<{ items: { id: string }[]; nextCursor: string | null }> {
    const response = await server()
      .get(`/api/v1/listings${query}`)
      .set('Cookie', cookies)
      .expect(200);
    return response.body;
  }

  it('narrows to one category without touching the others', async () => {
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 5,
      },
      1,
    );
    await listingFrom(
      {
        category: 'WATCH',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 5,
      },
      2,
    );

    expect((await browse()).items).toHaveLength(2);
    const bullion = await browse('?category=BULLION');
    expect(bullion.items).toHaveLength(1);
    expect(bullion.items[0]?.id).toBe('L-BROWSE-0001');
  });

  /* The filter is a risk appetite, so it has to be computed from the two
     figures rather than trusted from anything the borrower typed. */
  it('narrows by loan to value using the figures, not a stored field', async () => {
    // 100000 of 500000 is 2000 basis points.
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 5,
      },
      1,
    );
    // 250000 of 500000 is 5000 basis points.
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 250_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 5,
      },
      2,
    );

    const comfortable = await browse('?maxLoanToValueBasisPoints=3000');
    expect(comfortable.items.map((item) => item.id)).toEqual(['L-BROWSE-0001']);
    expect((await browse('?maxLoanToValueBasisPoints=5000')).items).toHaveLength(2);
  });

  it('sorts by rate ceiling and by closing soonest', async () => {
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 9,
      },
      1,
    );
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 1200,
        expiresInDays: 3,
      },
      2,
    );
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 1800,
        expiresInDays: 6,
      },
      3,
    );

    expect((await browse('?sort=rate')).items.map((item) => item.id)).toEqual([
      'L-BROWSE-0002',
      'L-BROWSE-0003',
      'L-BROWSE-0001',
    ]);
    expect((await browse('?sort=closing')).items.map((item) => item.id)).toEqual([
      'L-BROWSE-0002',
      'L-BROWSE-0003',
      'L-BROWSE-0001',
    ]);
  });

  /* The reason the cursor carries the sort value. Every one of these shares a
     rate, so a cursor on the id alone would skip or repeat rows at the page
     boundary and the reader would never know. */
  it('pages through a sorted list without losing or repeating a listing', async () => {
    for (let index = 1; index <= 30; index += 1) {
      await listingFrom(
        {
          category: 'BULLION',
          appraised: 500_000n,
          principal: 100_000n,
          maxRateBasisPoints: 2400,
          expiresInDays: 5,
        },
        index,
      );
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query: string =
        cursor === null ? '?sort=rate' : `?sort=rate&cursor=${encodeURIComponent(cursor)}`;
      const answer = await browse(query);
      seen.push(...answer.items.map((item) => item.id));
      cursor = answer.nextCursor;
      if (cursor === null) {
        break;
      }
    }

    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it('ignores a filter it cannot read rather than refusing the page', async () => {
    await listingFrom(
      {
        category: 'ART',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 5,
      },
      1,
    );

    expect((await browse('?category=NONSENSE')).items).toHaveLength(1);
    expect((await browse('?maxLoanToValueBasisPoints=banana')).items).toHaveLength(1);
    expect((await browse('?sort=sideways')).items).toHaveLength(1);
    expect((await browse('?cursor=not-a-cursor')).items).toHaveLength(1);
  });

  it('leaves an expired listing out however it is sorted', async () => {
    await listingFrom(
      {
        category: 'BULLION',
        appraised: 500_000n,
        principal: 100_000n,
        maxRateBasisPoints: 2400,
        expiresInDays: 1,
      },
      1,
    );
    harness.clock.advanceBy(2n * BigInt(oneDay));

    expect((await browse()).items).toHaveLength(0);
    expect((await browse('?sort=rate')).items).toHaveLength(0);
    expect((await browse('?sort=closing')).items).toHaveLength(0);
  });
});
