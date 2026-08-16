import { Injectable } from '@nestjs/common';
import type { Loan as LoanRow } from '@prisma/client';
import type {
  LoanParticipantRole,
  LoanQueries,
  LoanReadModel,
} from '../../../domain/ports/loan-queries.port';
import { accountIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import { toLoan } from '../mappers/lending.mapper';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaLoanQueries implements LoanQueries {
  constructor(private readonly prisma: PrismaService) {}

  async findById(loanId: LoanId): Promise<LoanReadModel | null> {
    const row = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (row === null) {
      return null;
    }
    const [readModel] = await this.withHolders([row]);
    return readModel ?? null;
  }

  async listByParticipant(
    accountId: AccountId,
    role: LoanParticipantRole,
  ): Promise<readonly LoanReadModel[]> {
    const notes =
      role === 'borrower'
        ? await this.prisma.borrowerNote.findMany({
            where: { holderAccountId: accountId },
            select: { loanId: true },
          })
        : await this.prisma.lenderNote.findMany({
            where: { holderAccountId: accountId },
            select: { loanId: true },
          });
    const rows = await this.prisma.loan.findMany({
      where: { id: { in: notes.map((note) => note.loanId) } },
      orderBy: { id: 'desc' },
    });
    return this.withHolders(rows);
  }

  /* Who is owed is whoever holds the lender note, so every read resolves the
     holder; one query for the whole page keeps a long loan list flat. */
  private async withHolders(rows: readonly LoanRow[]): Promise<LoanReadModel[]> {
    if (rows.length === 0) {
      return [];
    }
    const lenderNotes = await this.prisma.lenderNote.findMany({
      where: { loanId: { in: rows.map((row) => row.id) } },
      select: { loanId: true, holderAccountId: true },
    });
    const holderByLoanId = new Map(
      lenderNotes.map((note) => [note.loanId, accountIdOf(note.holderAccountId)]),
    );
    // One more query for the whole page rather than one per row, for the
    // same reason the note holders are resolved in a batch above.
    const receipts = await this.prisma.custodyReceipt.findMany({
      where: { id: { in: rows.map((row) => row.receiptId) } },
      select: { id: true, itemDescription: true },
    });
    const descriptionByReceiptId = new Map(
      receipts.map((receipt) => [receipt.id, receipt.itemDescription]),
    );
    return rows.map((row) => {
      const holder = holderByLoanId.get(row.id);
      if (holder === undefined) {
        throw new Error(`Loan ${row.id} has no lender note`);
      }
      return {
        loan: toLoan(row),
        lenderNoteHolderAccountId: holder,
        itemDescription: descriptionByReceiptId.get(row.receiptId) ?? '',
      };
    });
  }
}
