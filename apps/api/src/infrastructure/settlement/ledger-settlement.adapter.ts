import { Inject, Injectable } from '@nestjs/common';
import type { FundsHold as FundsHoldRow } from '@prisma/client';
import { InsufficientFunds } from '../../domain/ledger/insufficient-funds';
import { credit, debit } from '../../domain/ledger/ledger-entry';
import { LedgerTransaction } from '../../domain/ledger/ledger-transaction';
import type { LedgerTransactionKind } from '../../domain/ledger/ledger-transaction';
import { platformAccountIds } from '../../domain/ledger/platform-accounts';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type {
  FundsHold,
  HoldFundsCommand,
  ReleaseReason,
  SettlementPort,
  TransferCommand,
} from '../../domain/ports/settlement.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { accountIdOf, fundsHoldIdOf, ledgerTransactionIdOf } from '../../domain/shared/identifiers';
import type { AccountId } from '../../domain/shared/identifiers';
import { Instant } from '../../domain/shared/instant';
import { Money, currencyOf } from '../../domain/shared/money';
import type { Currency } from '../../domain/shared/money';
import type { Distribution, SettlementRef } from '../../domain/shared/settlement-ref';
import { PrismaService } from '../persistence/prisma.service';
import { transactionOf } from '../persistence/prisma-unit-of-work';
import { LedgerAccountDirectory } from './ledger-account-directory';

export class DistributionMismatchError extends Error {
  constructor() {
    super('The distribution does not sum to the held amount');
    this.name = 'DistributionMismatchError';
  }
}

export class FundsHoldNotHeldError extends Error {
  constructor(status: string) {
    super(`The funds hold is ${status}, not HELD`);
    this.name = 'FundsHoldNotHeldError';
  }
}

@Injectable()
export class LedgerSettlementAdapter implements SettlementPort {
  constructor(
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly directory: LedgerAccountDirectory,
    private readonly prisma: PrismaService,
  ) {}

  async hold(command: HoldFundsCommand, context: UnitOfWorkContext): Promise<FundsHold> {
    const currency = command.amount.currency;
    const available = await this.directory.resolve(
      command.accountId,
      'USER_AVAILABLE',
      currency,
      context,
    );
    const held = await this.directory.resolve(command.accountId, 'USER_HELD', currency, context);

    await this.directory.lock(available, context);
    const balance = await this.directory.balanceOf(available, context);
    if (balance < command.amount.minorUnits) {
      throw new InsufficientFunds();
    }

    const settlementRef = await this.write(
      'HOLD_FUNDS',
      command.reference,
      [debit(available, command.amount), credit(held, command.amount)],
      context,
    );

    const holdId = fundsHoldIdOf(this.idGenerator.generate());
    await transactionOf(context).fundsHold.create({
      data: {
        id: holdId,
        accountId: command.accountId,
        minorUnits: command.amount.minorUnits,
        currency,
        status: 'HELD',
        holdTransactionId: settlementRef.reference,
      },
    });

    return { id: holdId, accountId: command.accountId, amount: command.amount, settlementRef };
  }

  async releaseHold(
    hold: FundsHold,
    distribution: Distribution[],
    reason: ReleaseReason,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const row = await this.lockHold(hold.id, context);
    if (row.status !== 'HELD') {
      if (row.status === 'RELEASED' && row.settledTransactionId !== null) {
        return this.refOfExisting(row.settledTransactionId, context);
      }
      throw new FundsHoldNotHeldError(row.status);
    }

    const amount = Money.of(row.minorUnits, currencyOf(row.currency));
    const distributed = distribution.reduce((sum, target) => sum + target.amount.minorUnits, 0n);
    if (distributed !== amount.minorUnits) {
      throw new DistributionMismatchError();
    }

    const held = await this.directory.resolve(
      accountIdOf(row.accountId),
      'USER_HELD',
      amount.currency,
      context,
    );
    const entries = [debit(held, amount)];
    for (const target of distribution) {
      const targetAccount = await this.directory.resolve(
        target.accountId,
        'USER_AVAILABLE',
        target.amount.currency,
        context,
      );
      entries.push(credit(targetAccount, target.amount));
    }

    const settlementRef = await this.write(reason, hold.id, entries, context);
    await this.settleHold(row.id, 'RELEASED', settlementRef.reference, context);
    return settlementRef;
  }

  async refundHold(hold: FundsHold, context: UnitOfWorkContext): Promise<SettlementRef> {
    const row = await this.lockHold(hold.id, context);
    if (row.status !== 'HELD') {
      if (row.status === 'REFUNDED' && row.settledTransactionId !== null) {
        return this.refOfExisting(row.settledTransactionId, context);
      }
      throw new FundsHoldNotHeldError(row.status);
    }

    const amount = Money.of(row.minorUnits, currencyOf(row.currency));
    const owner = accountIdOf(row.accountId);
    const held = await this.directory.resolve(owner, 'USER_HELD', amount.currency, context);
    const available = await this.directory.resolve(
      owner,
      'USER_AVAILABLE',
      amount.currency,
      context,
    );

    const settlementRef = await this.write(
      'REFUND_HOLD',
      hold.id,
      [debit(held, amount), credit(available, amount)],
      context,
    );
    await this.settleHold(row.id, 'REFUNDED', settlementRef.reference, context);
    return settlementRef;
  }

  async transfer(command: TransferCommand, context: UnitOfWorkContext): Promise<SettlementRef> {
    const currency = command.amount.currency;
    const from = await this.directory.resolve(
      command.fromAccountId,
      'USER_AVAILABLE',
      currency,
      context,
    );
    const to = await this.directory.resolve(
      command.toAccountId,
      'USER_AVAILABLE',
      currency,
      context,
    );

    // The float is the platform's liability account and the only one allowed
    // to go negative (rule $2); every other source is balance checked.
    if (command.fromAccountId !== platformAccountIds.float) {
      await this.directory.lock(from, context);
      const balance = await this.directory.balanceOf(from, context);
      if (balance < command.amount.minorUnits) {
        throw new InsufficientFunds();
      }
    }

    return this.write(
      this.transferKindOf(command),
      command.reference,
      [debit(from, command.amount), credit(to, command.amount)],
      context,
    );
  }

  async availableBalance(accountId: AccountId, currency: Currency): Promise<Money> {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { ownerType: 'USER', ownerId: accountId, purpose: 'USER_AVAILABLE', currency },
    });
    if (account === null) {
      return Money.zero(currency);
    }
    const rows = await this.prisma.$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN minor_units ELSE -minor_units END), 0)::bigint AS balance
      FROM ledger_entry
      WHERE account_id = ${account.id}
    `;
    return Money.of(rows[0]?.balance ?? 0n, currency);
  }

  /* The port has no kind parameter, so the kind is derived from the
     participants: the float is the counterparty for external movement, and
     the only remaining user to user transfer in v1 is repayment. */
  private transferKindOf(command: TransferCommand): LedgerTransactionKind {
    if (command.fromAccountId === platformAccountIds.float) {
      return 'DEPOSIT';
    }
    if (command.toAccountId === platformAccountIds.float) {
      return 'WITHDRAW';
    }
    return 'REPAY_LOAN';
  }

  private async write(
    kind: LedgerTransactionKind,
    reference: string,
    entries: Parameters<typeof LedgerTransaction.build>[0]['entries'],
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const ledgerTransaction = LedgerTransaction.build({
      id: ledgerTransactionIdOf(this.idGenerator.generate()),
      kind,
      reference,
      occurredAt: this.clock.now(),
      entries,
    });

    const transaction = transactionOf(context);
    await transaction.ledgerTransaction.create({
      data: {
        id: ledgerTransaction.id,
        kind: ledgerTransaction.kind,
        reference: ledgerTransaction.reference,
        occurredAt: new Date(Number(ledgerTransaction.occurredAt.epochMilliseconds)),
      },
    });
    await transaction.ledgerEntry.createMany({
      data: ledgerTransaction.entries.map((entry) => ({
        id: this.idGenerator.generate(),
        transactionId: ledgerTransaction.id,
        accountId: entry.accountId,
        direction: entry.direction,
        minorUnits: entry.amount.minorUnits,
        currency: entry.amount.currency,
      })),
    });

    return {
      kind: 'ledger',
      reference: ledgerTransaction.id,
      settledAt: ledgerTransaction.occurredAt,
    };
  }

  private async lockHold(holdId: string, context: UnitOfWorkContext): Promise<FundsHoldRow> {
    const transaction = transactionOf(context);
    await transaction.$queryRaw`SELECT id FROM funds_hold WHERE id = ${holdId} FOR UPDATE`;
    const row = await transaction.fundsHold.findUnique({ where: { id: holdId } });
    if (row === null) {
      throw new Error(`Funds hold ${holdId} does not exist`);
    }
    return row;
  }

  private async settleHold(
    holdId: string,
    status: 'RELEASED' | 'REFUNDED',
    settledTransactionId: string,
    context: UnitOfWorkContext,
  ): Promise<void> {
    await transactionOf(context).fundsHold.update({
      where: { id: holdId },
      data: { status, settledTransactionId },
    });
  }

  private async refOfExisting(
    transactionId: string,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const row = await transactionOf(context).ledgerTransaction.findUnique({
      where: { id: transactionId },
    });
    if (row === null) {
      throw new Error(`Ledger transaction ${transactionId} does not exist`);
    }
    return {
      kind: 'ledger',
      reference: row.id,
      settledAt: Instant.fromEpochMilliseconds(BigInt(row.occurredAt.getTime())),
    };
  }
}
