import { Injectable } from '@nestjs/common';
import type { LoanRepository, OriginatedLoan } from '../../../domain/lending/loan-repository';
import type { Loan } from '../../../domain/lending/loan';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { LoanId, ReceiptId } from '../../../domain/shared/identifiers';
import { toLoan, toLoanRow } from '../mappers/lending.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleLoanVersionError extends Error {
  constructor(loanId: string) {
    super(`Loan ${loanId} was modified concurrently`);
    this.name = 'StaleLoanVersionError';
  }
}

@Injectable()
export class PrismaLoanRepository implements LoanRepository {
  async findById(id: LoanId, context: UnitOfWorkContext): Promise<Loan | null> {
    const row = await transactionOf(context).loan.findUnique({ where: { id } });
    return row === null ? null : toLoan(row);
  }

  async findLiveByReceipt(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<Loan | null> {
    const row = await transactionOf(context).loan.findFirst({
      where: { receiptId, status: { in: ['ACTIVE', 'DEFAULTED'] } },
    });
    return row === null ? null : toLoan(row);
  }

  async saveOrigination(originated: OriginatedLoan, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    await transaction.loan.create({ data: { ...toLoanRow(originated.loan), version: 0 } });
    await transaction.lenderNote.create({
      data: {
        id: originated.lenderNote.id,
        loanId: originated.lenderNote.loanId,
        holderAccountId: originated.lenderNote.holderAccountId,
        transferable: originated.lenderNote.transferable,
      },
    });
    await transaction.borrowerNote.create({
      data: {
        id: originated.borrowerNote.id,
        loanId: originated.borrowerNote.loanId,
        holderAccountId: originated.borrowerNote.holderAccountId,
        transferable: originated.borrowerNote.transferable,
      },
    });
  }

  async save(loan: Loan, context: UnitOfWorkContext): Promise<void> {
    const updated = await transactionOf(context).loan.updateMany({
      where: { id: loan.id, version: loan.version },
      data: { ...toLoanRow(loan), version: loan.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleLoanVersionError(loan.id);
    }
  }
}
