import { Inject, Injectable } from '@nestjs/common';
import { CustodyReceipt } from '../../domain/custody/custody-receipt';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { BurnReason, CustodyPort, IssueReceiptCommand } from '../../domain/ports/custody.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import { receiptIdOf } from '../../domain/shared/identifiers';
import type { AccountId, LoanId, ReceiptId } from '../../domain/shared/identifiers';
import type { SettlementRef } from '../../domain/shared/settlement-ref';
import { PrismaCustodyReceiptRepository } from '../persistence/repositories/prisma-custody-receipt.repository';

export class ReceiptNotFoundError extends Error {
  constructor(receiptId: string) {
    super(`Custody receipt ${receiptId} does not exist`);
    this.name = 'ReceiptNotFoundError';
  }
}

/* Every transition goes through the entity so the transition table stays the
   single authority; a rejected transition surfaces as its domain error. */
@Injectable()
export class DatabaseCustodyAdapter implements CustodyPort {
  constructor(
    private readonly receipts: PrismaCustodyReceiptRepository,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async issueReceipt(
    command: IssueReceiptCommand,
    context: UnitOfWorkContext,
  ): Promise<CustodyReceipt> {
    const receipt = CustodyReceipt.issue({
      id: receiptIdOf(this.idGenerator.generate()),
      vaultId: command.vaultId,
      holderAccountId: command.holderAccountId,
      intakeRecordHash: command.intakeRecordHash,
      appraisedValue: command.appraisedValue,
      appraisedAt: command.appraisedAt,
      appraiserId: command.appraiserId,
      itemCategory: command.itemCategory,
      insurancePolicyReference: command.insurancePolicyReference,
    });
    await this.receipts.save(receipt, context);
    return receipt;
  }

  async transferReceipt(
    receiptId: ReceiptId,
    toHolder: AccountId,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const receipt = await this.load(receiptId, context);
    const transferred = receipt.transferHolder(toHolder);
    if (!transferred.ok) {
      throw transferred.error;
    }
    await this.receipts.save(transferred.value, context);
    return this.custodyReference();
  }

  async encumberReceipt(
    receiptId: ReceiptId,
    loanId: LoanId,
    context: UnitOfWorkContext,
  ): Promise<void> {
    const receipt = await this.load(receiptId, context);
    const encumbered = receipt.encumber(loanId);
    if (!encumbered.ok) {
      throw encumbered.error;
    }
    await this.receipts.save(encumbered.value, context);
  }

  async claimReceipt(
    receiptId: ReceiptId,
    claimant: AccountId,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const receipt = await this.load(receiptId, context);
    const claimed = receipt.claimDefault(claimant);
    if (!claimed.ok) {
      throw claimed.error;
    }
    await this.receipts.save(claimed.value, context);
    return this.custodyReference();
  }

  async releaseEncumbrance(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<void> {
    const receipt = await this.load(receiptId, context);
    const released = receipt.releaseEncumbrance();
    if (!released.ok) {
      throw released.error;
    }
    await this.receipts.save(released.value, context);
  }

  async burnReceipt(
    receiptId: ReceiptId,
    reason: BurnReason,
    context: UnitOfWorkContext,
  ): Promise<SettlementRef> {
    const receipt = await this.load(receiptId, context);
    const burned =
      reason === 'REDEMPTION' ? receipt.burnForRedemption() : receipt.burnForLiquidation();
    if (!burned.ok) {
      throw burned.error;
    }
    await this.receipts.save(burned.value, context);
    return this.custodyReference();
  }

  private async load(receiptId: ReceiptId, context: UnitOfWorkContext): Promise<CustodyReceipt> {
    const receipt = await this.receipts.findById(receiptId, context);
    if (receipt === null) {
      throw new ReceiptNotFoundError(receiptId);
    }
    return receipt;
  }

  /* Phase 1 custody operations move no money, so the reference is an opaque
     operation id; Phase 3 replaces these with transaction digests wholesale. */
  private custodyReference(): SettlementRef {
    return { kind: 'ledger', reference: this.idGenerator.generate(), settledAt: this.clock.now() };
  }
}
