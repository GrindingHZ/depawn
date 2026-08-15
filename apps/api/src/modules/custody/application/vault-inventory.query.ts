import { Inject, Injectable } from '@nestjs/common';
import type { CustodyReceipt, ReceiptStatus } from '../../../domain/custody/custody-receipt';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { VaultId } from '../../../domain/shared/identifiers';

const everyStatus: ReceiptStatus[] = ['IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED'];

@Injectable()
export class VaultInventoryQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
  ) {}

  read(vaultId: VaultId, status: ReceiptStatus | undefined): Promise<readonly CustodyReceipt[]> {
    return this.unitOfWork.run((context) =>
      this.receipts.listByVault(vaultId, status === undefined ? everyStatus : [status], context),
    );
  }
}
