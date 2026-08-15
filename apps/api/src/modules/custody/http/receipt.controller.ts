import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { ReceiptListResponse, ReceiptResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { receiptIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { MemberReceiptsQuery } from '../application/member-receipts.query';
import { toReceiptResponse } from './custody-response.mapper';

@Controller()
export class ReceiptController {
  constructor(private readonly receipts: MemberReceiptsQuery) {}

  @Get('me/receipts')
  async listMine(@CurrentAccount() account: Account): Promise<ReceiptListResponse> {
    const receipts = await this.receipts.listFor(account.id);
    return { items: receipts.map(toReceiptResponse) };
  }

  @Get('receipts/:receiptId')
  async read(
    @Param('receiptId') receiptId: string,
    @CurrentAccount() account: Account,
  ): Promise<ReceiptResponse> {
    const receipt = await this.receipts.findById(receiptIdOf(receiptId));
    // Found but not visible reads as not found (docs/04 error table).
    if (
      receipt === null ||
      (receipt.holderAccountId !== account.id && !account.hasRole('VAULT_STAFF'))
    ) {
      throw new NotFoundException();
    }
    return toReceiptResponse(receipt);
  }
}
