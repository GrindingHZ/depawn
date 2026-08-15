import { Injectable } from '@nestjs/common';
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
    return this.withHolder(row);
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
    return Promise.all(rows.map((row) => this.withHolder(row)));
  }

  private async withHolder(
    row: NonNullable<Awaited<ReturnType<PrismaService['loan']['findUnique']>>>,
  ): Promise<LoanReadModel> {
    const lenderNote = await this.prisma.lenderNote.findUnique({ where: { loanId: row.id } });
    if (lenderNote === null) {
      throw new Error(`Loan ${row.id} has no lender note`);
    }
    return {
      loan: toLoan(row),
      lenderNoteHolderAccountId: accountIdOf(lenderNote.holderAccountId),
    };
  }
}
