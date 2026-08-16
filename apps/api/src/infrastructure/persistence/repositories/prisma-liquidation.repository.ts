import { Injectable } from '@nestjs/common';
import type {
  Liquidation as LiquidationRow,
  LiquidationBid as LiquidationBidRow,
} from '@prisma/client';
import { Liquidation } from '../../../domain/lending/liquidation';
import type { Bid, LiquidationStatus } from '../../../domain/lending/liquidation';
import type { LiquidationRepository } from '../../../domain/lending/liquidation-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import {
  accountIdOf,
  fundsHoldIdOf,
  liquidationIdOf,
  loanIdOf,
  receiptIdOf,
} from '../../../domain/shared/identifiers';
import type { LiquidationId, LoanId } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleLiquidationVersionError extends Error {
  constructor(liquidationId: string) {
    super(`Liquidation ${liquidationId} was modified concurrently`);
    this.name = 'StaleLiquidationVersionError';
  }
}

function instantOf(value: Date): Instant {
  return Instant.fromEpochMilliseconds(BigInt(value.getTime()));
}

function dateOf(value: Instant | null): Date | null {
  return value === null ? null : new Date(Number(value.epochMilliseconds));
}

function toBid(row: LiquidationBidRow): Bid {
  return {
    id: row.id,
    bidderAccountId: accountIdOf(row.bidderAccountId),
    amount: Money.of(row.minorUnits, currencyOf(row.currency)),
    fundsHoldId: fundsHoldIdOf(row.fundsHoldId),
    placedAt: instantOf(row.placedAt),
  };
}

function toLiquidation(row: LiquidationRow & { bids: LiquidationBidRow[] }): Liquidation {
  return Liquidation.restore({
    id: liquidationIdOf(row.id),
    loanId: loanIdOf(row.loanId),
    receiptId: receiptIdOf(row.receiptId),
    reservePrice: Money.of(row.reservePriceMinorUnits, currencyOf(row.currency)),
    status: row.status,
    opensAt: row.opensAt === null ? null : instantOf(row.opensAt),
    closesAt: row.closesAt === null ? null : instantOf(row.closesAt),
    bids: row.bids.map(toBid),
    winningBidId: row.winningBidId,
    version: row.version,
  });
}

@Injectable()
export class PrismaLiquidationRepository implements LiquidationRepository {
  async findById(id: LiquidationId, context: UnitOfWorkContext): Promise<Liquidation | null> {
    const row = await transactionOf(context).liquidation.findUnique({
      where: { id },
      include: { bids: { orderBy: { id: 'asc' } } },
    });
    return row === null ? null : toLiquidation(row);
  }

  async findByLoan(loanId: LoanId, context: UnitOfWorkContext): Promise<Liquidation | null> {
    const row = await transactionOf(context).liquidation.findUnique({
      where: { loanId },
      include: { bids: { orderBy: { id: 'asc' } } },
    });
    return row === null ? null : toLiquidation(row);
  }

  async listByStatus(
    statuses: readonly LiquidationStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly Liquidation[]> {
    const rows = await transactionOf(context).liquidation.findMany({
      where: { status: { in: [...statuses] } },
      include: { bids: { orderBy: { id: 'asc' } } },
      orderBy: { id: 'desc' },
    });
    return rows.map(toLiquidation);
  }

  async lock(id: LiquidationId, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).$queryRaw`SELECT id FROM liquidation WHERE id = ${id} FOR UPDATE`;
  }

  async save(liquidation: Liquidation, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const row = {
      loanId: liquidation.loanId,
      receiptId: liquidation.receiptId,
      reservePriceMinorUnits: liquidation.reservePrice.minorUnits,
      currency: liquidation.reservePrice.currency,
      status: liquidation.status,
      opensAt: dateOf(liquidation.opensAt),
      closesAt: dateOf(liquidation.closesAt),
      winningBidId: liquidation.winningBidId,
    };
    const existing = await transaction.liquidation.findUnique({ where: { id: liquidation.id } });
    if (existing === null) {
      await transaction.liquidation.create({ data: { id: liquidation.id, ...row, version: 0 } });
    } else {
      const updated = await transaction.liquidation.updateMany({
        where: { id: liquidation.id, version: liquidation.version },
        data: { ...row, version: liquidation.version + 1 },
      });
      if (updated.count === 0) {
        throw new StaleLiquidationVersionError(liquidation.id);
      }
    }

    for (const bid of liquidation.bids) {
      await transaction.liquidationBid.upsert({
        where: { id: bid.id },
        update: {},
        create: {
          id: bid.id,
          liquidationId: liquidation.id,
          bidderAccountId: bid.bidderAccountId,
          minorUnits: bid.amount.minorUnits,
          currency: bid.amount.currency,
          fundsHoldId: bid.fundsHoldId,
          placedAt: new Date(Number(bid.placedAt.epochMilliseconds)),
        },
      });
    }
  }
}
