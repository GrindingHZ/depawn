import { Global, Module } from '@nestjs/common';
import { SETTLEMENT_PORT } from '../../domain/ports/settlement.port';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import { UlidIdGeneratorAdapter } from '../id/ulid-id-generator.adapter';
import { LedgerAccountDirectory } from './ledger-account-directory';
import { LedgerSettlementAdapter } from './ledger-settlement.adapter';

@Global()
@Module({
  providers: [
    LedgerAccountDirectory,
    LedgerSettlementAdapter,
    { provide: ID_GENERATOR, useClass: UlidIdGeneratorAdapter },
    { provide: SETTLEMENT_PORT, useClass: LedgerSettlementAdapter },
  ],
  exports: [SETTLEMENT_PORT, LedgerSettlementAdapter, LedgerAccountDirectory, ID_GENERATOR],
})
export class SettlementModule {}
