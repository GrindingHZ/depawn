import { Inject, Injectable } from '@nestjs/common';
import type { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, ReceiptId } from '../../../domain/shared/identifiers';

@Injectable()
export class MemberReceiptsQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
  ) {}

  listFor(holderAccountId: AccountId): Promise<readonly CustodyReceipt[]> {
    return this.unitOfWork.run((context) => this.receipts.listByHolder(holderAccountId, context));
  }

  findById(receiptId: ReceiptId): Promise<CustodyReceipt | null> {
    return this.unitOfWork.run((context) => this.receipts.findById(receiptId, context));
  }
}
