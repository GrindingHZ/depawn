import { Injectable } from '@nestjs/common';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { Inject } from '@nestjs/common';
import { Money, currencyOf } from '../../../domain/shared/money';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

const aud = currencyOf('AUD');

export interface LoanBook {
  readonly outstandingCount: number;
  readonly outstandingPrincipal: Money;
  readonly overdueCount: number;
  readonly atRiskCount: number;
  readonly defaultedCount: number;
}

export interface VaultExposure {
  readonly vaultId: string;
  readonly exposure: Money;
  readonly insuredLimit: Money;
  readonly receiptCount: number;
}

/* Everything here is derived from the loan and receipt tables, so the loan
   book is a read rather than a second copy of the position that could
   disagree with the first. */
@Injectable()
export class LoanBookQuery {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async read(): Promise<LoanBook> {
    const now = new Date(Number(this.clock.now().epochMilliseconds));
    const [outstanding, overdue, atRisk, defaulted] = await Promise.all([
      this.prisma.loan.aggregate({
        where: { status: 'ACTIVE' },
        _count: true,
        _sum: { principalMinorUnits: true },
      }),
      // Past maturity but still inside grace: late, not yet at risk.
      this.prisma.loan.count({
        where: { status: 'ACTIVE', maturesAt: { lt: now }, graceEndsAt: { gte: now } },
      }),
      // Past grace and nobody has defaulted it yet.
      this.prisma.loan.count({ where: { status: 'ACTIVE', graceEndsAt: { lt: now } } }),
      this.prisma.loan.count({ where: { status: 'DEFAULTED' } }),
    ]);

    return {
      outstandingCount: outstanding._count,
      outstandingPrincipal: Money.of(outstanding._sum.principalMinorUnits ?? 0n, aud),
      overdueCount: overdue,
      atRiskCount: atRisk,
      defaultedCount: defaulted,
    };
  }

  async exposureByVault(): Promise<readonly VaultExposure[]> {
    const rows = await this.prisma.$queryRaw<
      { vault_id: string; exposure: bigint; insured_limit: bigint; receipt_count: bigint }[]
    >`
      SELECT v.id AS vault_id,
             COALESCE(SUM(r.appraised_value_minor_units), 0)::bigint AS exposure,
             v.insured_limit_minor_units AS insured_limit,
             COUNT(r.id)::bigint AS receipt_count
      FROM vault v
      LEFT JOIN custody_receipt r
        ON r.vault_id = v.id AND r.status IN ('IN_VAULT', 'ENCUMBERED')
      GROUP BY v.id, v.insured_limit_minor_units
      ORDER BY v.id ASC
    `;
    return rows.map((row) => ({
      vaultId: row.vault_id,
      exposure: Money.of(row.exposure, aud),
      insuredLimit: Money.of(row.insured_limit, aud),
      receiptCount: Number(row.receipt_count),
    }));
  }
}
