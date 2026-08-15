import { Injectable } from '@nestjs/common';
import type { CustodyReceipt, ReceiptStatus } from '../../../domain/custody/custody-receipt';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { AccountId, ReceiptId, VaultId } from '../../../domain/shared/identifiers';
import { Money } from '../../../domain/shared/money';
import type { Currency } from '../../../domain/shared/money';
import { toCustodyReceipt } from '../mappers/custody.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleReceiptVersionError extends Error {
  constructor(receiptId: string) {
    super(`Custody receipt ${receiptId} was modified concurrently`);
    this.name = 'StaleReceiptVersionError';
  }
}

@Injectable()
export class PrismaCustodyReceiptRepository implements CustodyReceiptRepository {
  async findById(id: ReceiptId, context: UnitOfWorkContext): Promise<CustodyReceipt | null> {
    const row = await transactionOf(context).custodyReceipt.findUnique({ where: { id } });
    return row === null ? null : toCustodyReceipt(row);
  }

  async listByHolder(
    holderAccountId: AccountId,
    context: UnitOfWorkContext,
  ): Promise<readonly CustodyReceipt[]> {
    const rows = await transactionOf(context).custodyReceipt.findMany({
      where: { holderAccountId },
      orderBy: { id: 'desc' },
    });
    return rows.map(toCustodyReceipt);
  }

  async listByVault(
    vaultId: VaultId,
    statuses: readonly ReceiptStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly CustodyReceipt[]> {
    const rows = await transactionOf(context).custodyReceipt.findMany({
      where: { vaultId, status: { in: [...statuses] } },
      orderBy: { id: 'desc' },
    });
    return rows.map(toCustodyReceipt);
  }

  async exposureOf(
    vaultId: VaultId,
    currency: Currency,
    context: UnitOfWorkContext,
  ): Promise<Money> {
    const rows = await transactionOf(context).$queryRaw<{ exposure: bigint }[]>`
      SELECT COALESCE(SUM(appraised_value_minor_units), 0)::bigint AS exposure
      FROM custody_receipt
      WHERE vault_id = ${vaultId}
        AND currency = ${currency}
        AND status IN ('IN_VAULT', 'ENCUMBERED')
    `;
    return Money.of(rows[0]?.exposure ?? 0n, currency);
  }

  async findByIntakeRecordHash(
    intakeRecordHash: string,
    context: UnitOfWorkContext,
  ): Promise<CustodyReceipt | null> {
    const row = await transactionOf(context).custodyReceipt.findFirst({
      where: { intakeRecordHash },
    });
    return row === null ? null : toCustodyReceipt(row);
  }

  async save(receipt: CustodyReceipt, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const data = {
      vaultId: receipt.vaultId,
      holderAccountId: receipt.holderAccountId,
      intakeRecordHash: receipt.intakeRecordHash,
      appraisedValueMinorUnits: receipt.appraisedValue.minorUnits,
      currency: receipt.appraisedValue.currency,
      appraisedAt: new Date(Number(receipt.appraisedAt.epochMilliseconds)),
      appraiserId: receipt.appraiserId,
      itemCategory: receipt.itemCategory,
      insurancePolicyReference: receipt.insurancePolicyReference,
      status: receipt.status,
      encumberedByLoanId: receipt.encumberedByLoanId,
    };
    const existing = await transaction.custodyReceipt.findUnique({ where: { id: receipt.id } });
    if (existing === null) {
      await transaction.custodyReceipt.create({ data: { id: receipt.id, ...data, version: 0 } });
      return;
    }
    const updated = await transaction.custodyReceipt.updateMany({
      where: { id: receipt.id, version: receipt.version },
      data: { ...data, version: receipt.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleReceiptVersionError(receipt.id);
    }
  }
}
