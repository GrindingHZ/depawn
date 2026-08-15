import { Injectable } from '@nestjs/common';
import type { RedemptionRequest as RedemptionRequestRow } from '@prisma/client';
import { RedemptionRequest } from '../../../domain/custody/redemption-request';
import type { RedemptionStatus } from '../../../domain/custody/redemption-request';
import type { RedemptionRequestRepository } from '../../../domain/custody/redemption-request-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import {
  accountIdOf,
  receiptIdOf,
  redemptionRequestIdOf,
  staffIdOf,
  vaultIdOf,
} from '../../../domain/shared/identifiers';
import type {
  AccountId,
  ReceiptId,
  RedemptionRequestId,
  VaultId,
} from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { transactionOf } from '../prisma-unit-of-work';

function instantOf(value: Date): Instant {
  return Instant.fromEpochMilliseconds(BigInt(value.getTime()));
}

function dateOf(value: Instant | null): Date | null {
  return value === null ? null : new Date(Number(value.epochMilliseconds));
}

function toRedemptionRequest(row: RedemptionRequestRow): RedemptionRequest {
  return RedemptionRequest.restore({
    id: redemptionRequestIdOf(row.id),
    receiptId: receiptIdOf(row.receiptId),
    vaultId: vaultIdOf(row.vaultId),
    requestedByAccountId: accountIdOf(row.requestedByAccountId),
    requestedAt: instantOf(row.requestedAt),
    status: row.status,
    verifiedAt: row.verifiedAt === null ? null : instantOf(row.verifiedAt),
    verifiedByStaffId: row.verifiedByStaffId === null ? null : staffIdOf(row.verifiedByStaffId),
    releasedAt: row.releasedAt === null ? null : instantOf(row.releasedAt),
    releasedByStaffId: row.releasedByStaffId === null ? null : staffIdOf(row.releasedByStaffId),
    sealNumberBroken: row.sealNumberBroken,
  });
}

@Injectable()
export class PrismaRedemptionRequestRepository implements RedemptionRequestRepository {
  async findById(
    id: RedemptionRequestId,
    context: UnitOfWorkContext,
  ): Promise<RedemptionRequest | null> {
    const row = await transactionOf(context).redemptionRequest.findUnique({ where: { id } });
    return row === null ? null : toRedemptionRequest(row);
  }

  async findByReceipt(
    receiptId: ReceiptId,
    context: UnitOfWorkContext,
  ): Promise<RedemptionRequest | null> {
    const row = await transactionOf(context).redemptionRequest.findFirst({
      where: { receiptId },
      orderBy: { requestedAt: 'desc' },
    });
    return row === null ? null : toRedemptionRequest(row);
  }

  async listByRequester(
    accountId: AccountId,
    context: UnitOfWorkContext,
  ): Promise<readonly RedemptionRequest[]> {
    const rows = await transactionOf(context).redemptionRequest.findMany({
      where: { requestedByAccountId: accountId },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toRedemptionRequest);
  }

  async listForVault(
    vaultId: VaultId,
    statuses: readonly RedemptionStatus[],
    context: UnitOfWorkContext,
  ): Promise<readonly RedemptionRequest[]> {
    const rows = await transactionOf(context).redemptionRequest.findMany({
      where: { vaultId, status: { in: [...statuses] } },
      orderBy: { requestedAt: 'asc' },
    });
    return rows.map(toRedemptionRequest);
  }

  async lock(id: RedemptionRequestId, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context)
      .$queryRaw`SELECT id FROM redemption_request WHERE id = ${id} FOR UPDATE`;
  }

  async save(request: RedemptionRequest, context: UnitOfWorkContext): Promise<void> {
    const row = {
      receiptId: request.receiptId,
      vaultId: request.vaultId,
      requestedByAccountId: request.requestedByAccountId,
      requestedAt: new Date(Number(request.requestedAt.epochMilliseconds)),
      status: request.status,
      verifiedAt: dateOf(request.verifiedAt),
      verifiedByStaffId: request.verifiedByStaffId,
      releasedAt: dateOf(request.releasedAt),
      releasedByStaffId: request.releasedByStaffId,
      sealNumberBroken: request.sealNumberBroken,
    };
    await transactionOf(context).redemptionRequest.upsert({
      where: { id: request.id },
      update: row,
      create: { id: request.id, ...row },
    });
  }
}
