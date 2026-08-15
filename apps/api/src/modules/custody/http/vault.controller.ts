import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { beginIntakeRequestSchema } from '@depawn/contracts';
import type {
  BeginIntakeRequest,
  IntakeResponse,
  ReceiptListResponse,
  VaultExposureResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import type { ReceiptStatus } from '../../../domain/custody/custody-receipt';
import { vaultIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoneyDto } from '../../shared/http/money.mapper';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { BeginIntakeUseCase } from '../application/begin-intake.use-case';
import { VaultExposureQuery } from '../application/vault-exposure.query';
import { VaultInventoryQuery } from '../application/vault-inventory.query';
import { custodyStatusFor, toIntakeResponse, toReceiptResponse } from './custody-response.mapper';

const receiptStatuses: readonly ReceiptStatus[] = [
  'IN_VAULT',
  'ENCUMBERED',
  'RELEASED',
  'LIQUIDATED',
];

function parseReceiptStatus(value: string | undefined): ReceiptStatus | undefined {
  return receiptStatuses.find((status) => status === value);
}

@Controller('vaults')
@Roles('VAULT_STAFF')
export class VaultController {
  constructor(
    private readonly beginIntake: BeginIntakeUseCase,
    private readonly inventoryQuery: VaultInventoryQuery,
    private readonly exposureQuery: VaultExposureQuery,
  ) {}

  @Post(':vaultId/intakes')
  @UseInterceptors(IdempotencyInterceptor)
  async begin(
    @Param('vaultId') vaultId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(beginIntakeRequestSchema)) body: BeginIntakeRequest,
  ): Promise<IntakeResponse> {
    const result = await this.beginIntake.execute({
      vaultId: vaultIdOf(vaultId),
      requestedBy: account.id,
      borrowerEmail: body.borrowerEmail,
      itemCategory: body.itemCategory,
      itemDescription: body.itemDescription,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return toIntakeResponse(result.value, []);
  }

  @Get(':vaultId/inventory')
  async readInventory(
    @Param('vaultId') vaultId: string,
    @Query('status') status?: string,
  ): Promise<ReceiptListResponse> {
    const receipts = await this.inventoryQuery.read(vaultIdOf(vaultId), parseReceiptStatus(status));
    return { items: receipts.map(toReceiptResponse) };
  }

  @Get(':vaultId/exposure')
  async readExposure(@Param('vaultId') vaultId: string): Promise<VaultExposureResponse> {
    const exposure = await this.exposureQuery.read(vaultIdOf(vaultId));
    if (exposure === null) {
      throw new NotFoundException();
    }
    return {
      vaultId: exposure.vault.id,
      insuredLimit: toMoneyDto(exposure.vault.insuredLimit),
      exposure: toMoneyDto(exposure.exposure),
      remaining: toMoneyDto(exposure.remaining),
    };
  }
}
