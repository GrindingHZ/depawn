import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ReceiptListResponse, ReceiptResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { receiptIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { MemberReceiptsQuery } from '../application/member-receipts.query';
import { ReceiptPhotographQuery } from '../application/receipt-photograph.query';
import { toReceiptResponse } from './custody-response.mapper';

@Controller()
export class ReceiptController {
  constructor(
    private readonly receipts: MemberReceiptsQuery,
    private readonly photographs: ReceiptPhotographQuery,
  ) {}

  @Get('me/receipts')
  async listMine(@CurrentAccount() account: Account): Promise<ReceiptListResponse> {
    const receipts = await this.receipts.listFor(account.id);
    return { items: receipts.map(toReceiptResponse) };
  }

  /* The bytes of the item, for whoever is entitled to look at them. Not
     visible reads as not found, so nobody can probe which receipts exist.

     Two headers matter beyond the type. The key is a content hash, so the
     answer for a given hash can never change and may be cached forever.
     `nosniff` stops a browser second guessing the type we verified at
     upload, which is the other half of refusing SVG in the first place. */
  @Get('receipts/:receiptId/photo')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Disposition', 'inline')
  async readPhoto(
    @Param('receiptId') receiptId: string,
    @CurrentAccount() account: Account,
    @Res() response: Response,
  ): Promise<void> {
    const photograph = await this.photographs.findVisibleTo(receiptIdOf(receiptId), account);
    if (photograph === null) {
      throw new NotFoundException();
    }
    response.setHeader('Content-Type', photograph.contentType);
    response.setHeader('ETag', `"${photograph.contentHash}"`);
    response.end(Buffer.from(photograph.bytes));
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
