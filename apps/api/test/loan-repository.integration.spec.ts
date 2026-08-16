import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Loan } from '../src/domain/lending/loan';
import {
  accountIdOf,
  borrowerNoteIdOf,
  lenderNoteIdOf,
  loanIdOf,
  receiptIdOf,
} from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import {
  PrismaLoanRepository,
  StaleLoanVersionError,
} from '../src/infrastructure/persistence/repositories/prisma-loan.repository';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const aud = currencyOf('AUD');
const startedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);

function originated(id: string) {
  const loan = Loan.originate({
    id: loanIdOf(id),
    receiptId: receiptIdOf(`RCP-${id}`),
    borrowerAccountId: accountIdOf('REPO-BORROWER'),
    principal: Money.of(250_000n, aud),
    annualPercentageRateBasisPoints: 1_800,
    startedAt,
    durationMs: 2_592_000_000n,
    gracePeriodMs: 604_800_000n,
    liquidationFeeBasisPoints: 200,
    lenderNoteId: lenderNoteIdOf(`LN-${id}`),
    borrowerNoteId: borrowerNoteIdOf(`BN-${id}`),
    originationSettlementRef: { kind: 'ledger', reference: `TX-${id}`, settledAt: startedAt },
  });
  return {
    loan,
    lenderNote: {
      id: loan.lenderNoteId,
      loanId: loan.id,
      holderAccountId: accountIdOf('REPO-LENDER'),
      transferable: false,
    },
    borrowerNote: {
      id: loan.borrowerNoteId,
      loanId: loan.id,
      holderAccountId: loan.borrowerAccountId,
      transferable: false,
    },
  };
}

describe('loan repository', () => {
  let harness: TestApplication;
  let unitOfWork: PrismaUnitOfWork;
  const loans = new PrismaLoanRepository();

  beforeAll(async () => {
    harness = await createTestApplication();
    unitOfWork = harness.app.get(PrismaUnitOfWork);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
  });

  it('round trips an origination with both notes', async () => {
    await unitOfWork.run((context) => loans.saveOrigination(originated('L1'), context));

    const reloaded = await unitOfWork.run((context) => loans.findById(loanIdOf('L1'), context));
    expect(reloaded).not.toBeNull();
    expect(reloaded?.status).toBe('ACTIVE');
    expect(reloaded?.principal.equals(Money.of(250_000n, aud))).toBe(true);
    expect(reloaded?.maturesAt.epochMilliseconds).toBe(1_700_000_000_000n + 2_592_000_000n);
    expect(reloaded?.lenderNoteId).toBe('LN-L1');
    expect(reloaded?.originationSettlementRef.reference).toBe('TX-L1');

    const noteRows = await harness.prisma.lenderNote.findMany({ where: { loanId: 'L1' } });
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.holderAccountId).toBe('REPO-LENDER');
    expect(noteRows[0]?.transferable).toBe(false);
    const borrowerRows = await harness.prisma.borrowerNote.findMany({ where: { loanId: 'L1' } });
    expect(borrowerRows[0]?.holderAccountId).toBe('REPO-BORROWER');
  });

  it('finds the live loan for a receipt and ignores closed ones', async () => {
    await unitOfWork.run((context) => loans.saveOrigination(originated('L2'), context));

    const live = await unitOfWork.run((context) =>
      loans.findLiveByReceipt(receiptIdOf('RCP-L2'), context),
    );
    expect(live?.id).toBe('L2');

    await harness.prisma.loan.update({ where: { id: 'L2' }, data: { status: 'REPAID' } });
    const afterClose = await unitOfWork.run((context) =>
      loans.findLiveByReceipt(receiptIdOf('RCP-L2'), context),
    );
    expect(afterClose).toBeNull();
  });

  it('bumps the version on save and rejects a stale writer', async () => {
    await unitOfWork.run((context) => loans.saveOrigination(originated('L3'), context));
    const fresh = await unitOfWork.run((context) => loans.findById(loanIdOf('L3'), context));
    if (fresh === null) {
      throw new Error('expected the loan to reload');
    }

    await unitOfWork.run((context) => loans.save(fresh, context));
    const bumped = await harness.prisma.loan.findUnique({ where: { id: 'L3' } });
    expect(bumped?.version).toBe(1);

    await expect(unitOfWork.run((context) => loans.save(fresh, context))).rejects.toBeInstanceOf(
      StaleLoanVersionError,
    );
  });
});
