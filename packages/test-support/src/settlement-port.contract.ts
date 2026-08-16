import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SettlementPort } from '@depawn/api/src/domain/ports/settlement.port';
import type { UnitOfWorkContext } from '@depawn/api/src/domain/ports/unit-of-work';
import type { AccountId } from '@depawn/api/src/domain/shared/identifiers';
import { Money, currencyOf } from '@depawn/api/src/domain/shared/money';
import type { SettlementRef } from '@depawn/api/src/domain/shared/settlement-ref';

export interface SettlementPortTestSubject {
  readonly port: SettlementPort;
  runInUnitOfWork<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
  createAccountWithBalance(minorUnits: bigint): Promise<AccountId>;
  availableBalanceOf(accountId: AccountId): Promise<bigint>;
  heldBalanceOf(accountId: AccountId): Promise<bigint>;
  referenceExists(settlementRef: SettlementRef): Promise<boolean>;
  /* Phase 1 reads the ledger transaction kind; Phase 3 will read whatever
     the chain calls the same distinction. */
  transactionKindOf(reference: string): Promise<string>;
  close(): Promise<void>;
}

/* One suite, every implementation. When the Sui adapter passes the same
   suite the ledger adapter passes, the migration is provably behaviour
   preserving at the seam (docs/06-testing.md layer 3). */
export function describeSettlementPortContract(
  name: string,
  createSubject: () => Promise<SettlementPortTestSubject>,
): void {
  const aud = currencyOf('AUD');

  describe(`SettlementPort contract: ${name}`, () => {
    let subject: SettlementPortTestSubject;

    beforeAll(async () => {
      subject = await createSubject();
    });

    afterAll(async () => {
      await subject.close();
    });

    it('makes held funds unavailable to the holder', async () => {
      const account = await subject.createAccountWithBalance(10_000n);
      await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: account, amount: Money.of(6000n, aud), reference: 'contract-hold' },
          context,
        ),
      );

      expect(await subject.availableBalanceOf(account)).toBe(4000n);
      expect(await subject.heldBalanceOf(account)).toBe(6000n);
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.hold(
            { accountId: account, amount: Money.of(5000n, aud), reference: 'contract-hold-2' },
            context,
          ),
        ),
      ).rejects.toThrow();
    });

    it('rejects a hold exceeding the available balance', async () => {
      const account = await subject.createAccountWithBalance(100n);
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.hold(
            { accountId: account, amount: Money.of(101n, aud), reference: 'contract-over' },
            context,
          ),
        ),
      ).rejects.toThrow();
      expect(await subject.availableBalanceOf(account)).toBe(100n);
    });

    it('refunds a hold exactly once even if called twice', async () => {
      const account = await subject.createAccountWithBalance(5000n);
      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: account, amount: Money.of(5000n, aud), reference: 'contract-refund' },
          context,
        ),
      );

      const first = await subject.runInUnitOfWork((context) =>
        subject.port.refundHold(hold, context),
      );
      const second = await subject.runInUnitOfWork((context) =>
        subject.port.refundHold(hold, context),
      );

      expect(second.reference).toBe(first.reference);
      expect(await subject.availableBalanceOf(account)).toBe(5000n);
      expect(await subject.heldBalanceOf(account)).toBe(0n);
    });

    it('releases a hold to a distribution that sums to the held amount', async () => {
      const lender = await subject.createAccountWithBalance(10_000n);
      const borrower = await subject.createAccountWithBalance(0n);
      const feeCollector = await subject.createAccountWithBalance(0n);

      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: lender, amount: Money.of(10_000n, aud), reference: 'contract-release' },
          context,
        ),
      );
      await subject.runInUnitOfWork((context) =>
        subject.port.releaseHold(
          hold,
          [
            { accountId: borrower, amount: Money.of(9800n, aud) },
            { accountId: feeCollector, amount: Money.of(200n, aud) },
          ],
          'ORIGINATE_LOAN',
          context,
        ),
      );

      expect(await subject.availableBalanceOf(borrower)).toBe(9800n);
      expect(await subject.availableBalanceOf(feeCollector)).toBe(200n);
      expect(await subject.heldBalanceOf(lender)).toBe(0n);
      expect(await subject.availableBalanceOf(lender)).toBe(0n);
    });

    it('records the reason the caller named on the release', async () => {
      const bidder = await subject.createAccountWithBalance(10_000n);
      const seller = await subject.createAccountWithBalance(0n);
      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: bidder, amount: Money.of(10_000n, aud), reference: 'contract-reason' },
          context,
        ),
      );

      const settlementRef = await subject.runInUnitOfWork((context) =>
        subject.port.releaseHold(
          hold,
          [{ accountId: seller, amount: Money.of(10_000n, aud) }],
          'SETTLE_LIQUIDATION',
          context,
        ),
      );

      // A liquidation settlement must not be filed as an origination: the
      // ledger kind is what an auditor reads to tell the two apart.
      expect(await subject.transactionKindOf(settlementRef.reference)).toBe('SETTLE_LIQUIDATION');
    });

    it('releases a hold exactly once even if called twice', async () => {
      const lender = await subject.createAccountWithBalance(2000n);
      const borrower = await subject.createAccountWithBalance(0n);
      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: lender, amount: Money.of(2000n, aud), reference: 'contract-release-once' },
          context,
        ),
      );
      const distribution = [{ accountId: borrower, amount: Money.of(2000n, aud) }];

      const first = await subject.runInUnitOfWork((context) =>
        subject.port.releaseHold(hold, distribution, 'ORIGINATE_LOAN', context),
      );
      const second = await subject.runInUnitOfWork((context) =>
        subject.port.releaseHold(hold, distribution, 'ORIGINATE_LOAN', context),
      );

      expect(second.reference).toBe(first.reference);
      expect(await subject.availableBalanceOf(borrower)).toBe(2000n);
      expect(await subject.heldBalanceOf(lender)).toBe(0n);
    });

    it('rejects a release whose distribution does not sum to the held amount', async () => {
      const lender = await subject.createAccountWithBalance(1000n);
      const borrower = await subject.createAccountWithBalance(0n);
      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: lender, amount: Money.of(1000n, aud), reference: 'contract-mismatch' },
          context,
        ),
      );

      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.releaseHold(
            hold,
            [{ accountId: borrower, amount: Money.of(999n, aud) }],
            'ORIGINATE_LOAN',
            context,
          ),
        ),
      ).rejects.toThrow();
      expect(await subject.heldBalanceOf(lender)).toBe(1000n);
    });

    it('returns a settlement reference that resolves to the movement', async () => {
      const account = await subject.createAccountWithBalance(500n);
      const hold = await subject.runInUnitOfWork((context) =>
        subject.port.hold(
          { accountId: account, amount: Money.of(500n, aud), reference: 'contract-ref' },
          context,
        ),
      );

      expect(hold.settlementRef.reference).toBeTruthy();
      expect(await subject.referenceExists(hold.settlementRef)).toBe(true);
    });
  });
}
