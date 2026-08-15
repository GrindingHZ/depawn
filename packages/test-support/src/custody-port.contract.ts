import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustodyReceipt } from '@depawn/api/src/domain/custody/custody-receipt';
import type { CustodyPort, IssueReceiptCommand } from '@depawn/api/src/domain/ports/custody.port';
import type { UnitOfWorkContext } from '@depawn/api/src/domain/ports/unit-of-work';
import { accountIdOf, loanIdOf } from '@depawn/api/src/domain/shared/identifiers';
import type { ReceiptId } from '@depawn/api/src/domain/shared/identifiers';

export interface CustodyPortTestSubject {
  readonly port: CustodyPort;
  runInUnitOfWork<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
  /* A valid issue command against a vault that exists in the subject's world. */
  nextIssueCommand(): IssueReceiptCommand;
  receiptById(id: ReceiptId): Promise<CustodyReceipt | null>;
  close(): Promise<void>;
}

/* One suite, every implementation, mirroring the settlement contract: when
   the Sui adapter passes what the database adapter passes, the custody seam
   is provably behaviour preserving (docs/06-testing.md layer 3). */
export function describeCustodyPortContract(
  name: string,
  createSubject: () => Promise<CustodyPortTestSubject>,
): void {
  describe(`CustodyPort contract: ${name}`, () => {
    let subject: CustodyPortTestSubject;

    beforeAll(async () => {
      subject = await createSubject();
    });

    afterAll(async () => {
      await subject.close();
    });

    async function issue(): Promise<CustodyReceipt> {
      return subject.runInUnitOfWork((context) =>
        subject.port.issueReceipt(subject.nextIssueCommand(), context),
      );
    }

    it('issues a receipt in the vault carrying the appraisal snapshot', async () => {
      const command = subject.nextIssueCommand();
      const issued = await subject.runInUnitOfWork((context) =>
        subject.port.issueReceipt(command, context),
      );

      expect(issued.status).toBe('IN_VAULT');
      expect(issued.holderAccountId).toBe(command.holderAccountId);
      expect(issued.intakeRecordHash).toBe(command.intakeRecordHash);
      expect(issued.appraisedValue.minorUnits).toBe(command.appraisedValue.minorUnits);

      const persisted = await subject.receiptById(issued.id);
      expect(persisted?.status).toBe('IN_VAULT');
    });

    it('encumbers only a receipt that is in the vault', async () => {
      const receipt = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-1'), context),
      );

      const encumbered = await subject.receiptById(receipt.id);
      expect(encumbered?.status).toBe('ENCUMBERED');
      expect(encumbered?.encumberedByLoanId).toBe('CONTRACT-LOAN-1');

      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-2'), context),
        ),
      ).rejects.toThrow();
    });

    it('releases an encumbrance back to the vault', async () => {
      const receipt = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-3'), context),
      );
      await subject.runInUnitOfWork((context) =>
        subject.port.releaseEncumbrance(receipt.id, context),
      );

      const released = await subject.receiptById(receipt.id);
      expect(released?.status).toBe('IN_VAULT');
      expect(released?.encumberedByLoanId).toBeNull();
    });

    it('transfers the holder only while the receipt is in the vault', async () => {
      const receipt = await issue();
      const newHolder = accountIdOf('CONTRACT-NEW-HOLDER');
      const reference = await subject.runInUnitOfWork((context) =>
        subject.port.transferReceipt(receipt.id, newHolder, context),
      );
      expect(reference.reference).toBeTruthy();

      const transferred = await subject.receiptById(receipt.id);
      expect(transferred?.holderAccountId).toBe(newHolder);

      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-4'), context),
      );
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.transferReceipt(receipt.id, accountIdOf('CONTRACT-OTHER'), context),
        ),
      ).rejects.toThrow();
    });

    it('burning for redemption is terminal', async () => {
      const receipt = await issue();
      const reference = await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(receipt.id, 'REDEMPTION', context),
      );
      expect(reference.reference).toBeTruthy();

      const burned = await subject.receiptById(receipt.id);
      expect(burned?.status).toBe('RELEASED');

      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.burnReceipt(receipt.id, 'REDEMPTION', context),
        ),
      ).rejects.toThrow();
      await expect(
        subject.runInUnitOfWork((context) =>
          subject.port.encumberReceipt(receipt.id, loanIdOf('CONTRACT-LOAN-5'), context),
        ),
      ).rejects.toThrow();
    });

    it('burning for liquidation is terminal from either live state', async () => {
      const fromVault = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(fromVault.id, 'LIQUIDATION', context),
      );
      expect((await subject.receiptById(fromVault.id))?.status).toBe('LIQUIDATED');

      const fromEncumbered = await issue();
      await subject.runInUnitOfWork((context) =>
        subject.port.encumberReceipt(fromEncumbered.id, loanIdOf('CONTRACT-LOAN-6'), context),
      );
      await subject.runInUnitOfWork((context) =>
        subject.port.burnReceipt(fromEncumbered.id, 'LIQUIDATION', context),
      );
      const burned = await subject.receiptById(fromEncumbered.id);
      expect(burned?.status).toBe('LIQUIDATED');
      expect(burned?.encumberedByLoanId).toBeNull();
    });
  });
}
