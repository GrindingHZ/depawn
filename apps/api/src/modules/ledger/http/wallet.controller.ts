import { Body, Controller, Get, Inject, Post, Query, UseInterceptors } from '@nestjs/common';
import { depositRequestSchema, withdrawalRequestSchema } from '@depawn/contracts';
import type {
  BalanceResponse,
  DepositRequest,
  LedgerEntriesResponse,
  SettlementResponse,
  WithdrawalRequest,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { WALLET_QUERIES } from '../../../domain/ports/wallet-queries.port';
import type { WalletQueries } from '../../../domain/ports/wallet-queries.port';
import { currencyOf } from '../../../domain/shared/money';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toMoneyDto, toSettlementRefDto } from '../../shared/http/money.mapper';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { DepositUseCase } from '../application/deposit.use-case';
import { WithdrawUseCase } from '../application/withdraw.use-case';

const walletCurrency = currencyOf('AUD');
const defaultPageSize = 25;
const maxPageSize = 100;

@Controller('me')
export class WalletController {
  constructor(
    private readonly depositUseCase: DepositUseCase,
    private readonly withdrawUseCase: WithdrawUseCase,
    @Inject(WALLET_QUERIES) private readonly walletQueries: WalletQueries,
  ) {}

  @Get('balance')
  async readBalance(@CurrentAccount() account: Account): Promise<BalanceResponse> {
    const balance = await this.walletQueries.balanceOf(account.id, walletCurrency);
    return { available: toMoneyDto(balance.available), held: toMoneyDto(balance.held) };
  }

  @Get('ledger-entries')
  async readLedgerEntries(
    @CurrentAccount() account: Account,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<LedgerEntriesResponse> {
    const requested = Number(limitRaw ?? defaultPageSize);
    const limit = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), maxPageSize)
      : defaultPageSize;
    const page = await this.walletQueries.ledgerEntriesOf(account.id, cursor ?? null, limit);
    return {
      items: page.items.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        direction: entry.direction,
        purpose: entry.purpose,
        amount: toMoneyDto(entry.amount),
        occurredAt: new Date(Number(entry.occurredAt.epochMilliseconds)).toISOString(),
        reference: entry.reference,
      })),
      nextCursor: page.nextCursor,
    };
  }

  @Post('deposits')
  @Roles('OPERATIONS')
  @UseInterceptors(IdempotencyInterceptor)
  async depositFunds(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(depositRequestSchema)) body: DepositRequest,
  ): Promise<SettlementResponse> {
    const result = await this.depositUseCase.execute({
      requestedBy: account.id,
      targetEmail: body.email,
      amount: toMoney(body.amount),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, 404);
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }

  @Post('withdrawals')
  @UseInterceptors(IdempotencyInterceptor)
  async withdrawFunds(
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(withdrawalRequestSchema)) body: WithdrawalRequest,
  ): Promise<SettlementResponse> {
    const result = await this.withdrawUseCase.execute({
      accountId: account.id,
      amount: toMoney(body.amount),
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, 422);
    }
    return { settlementRef: toSettlementRefDto(result.value) };
  }
}
