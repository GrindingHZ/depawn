import { Module } from '@nestjs/common';
import { ACCOUNT_REPOSITORY } from '../../domain/accounts/account-repository';
import { WALLET_QUERIES } from '../../domain/ports/wallet-queries.port';
import { PrismaAccountRepository } from '../../infrastructure/persistence/repositories/prisma-account.repository';
import { PrismaWalletQueries } from '../../infrastructure/persistence/queries/prisma-wallet-queries';
import { DepositUseCase } from './application/deposit.use-case';
import { WithdrawUseCase } from './application/withdraw.use-case';
import { WalletController } from './http/wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [
    DepositUseCase,
    WithdrawUseCase,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    { provide: WALLET_QUERIES, useClass: PrismaWalletQueries },
  ],
})
export class LedgerModule {}
