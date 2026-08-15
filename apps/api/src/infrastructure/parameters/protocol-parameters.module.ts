import { Global, Module } from '@nestjs/common';
import { PROTOCOL_PARAMETERS } from '../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import { Money, currencyOf } from '../../domain/shared/money';

/* Demo defaults from docs/OPEN-QUESTIONS.md: holding period 30 days and rate
   cap 4800 (Q-001), bullion LTV 6000 (Q-003), a dual appraisal threshold
   high enough for a single appraisal demo path (Q-005), and a 10 minute
   minimum offer lifetime (Q-007). The grace period and origination fee match
   the worked example in docs/04-api-contract.md. Admin editing arrives with
   P7; Phase 3 mirrors this object as shared Config behind an AdminCap. */
const demoParameters: ProtocolParameters = {
  maxLoanToValueBasisPointsByCategory: { BULLION: 6000 },
  maxAnnualPercentageRateBasisPoints: 4800,
  minimumOfferLifetimeMs: 600_000n,
  originationFeeBasisPoints: 200,
  liquidationFeeBasisPoints: 200,
  gracePeriodMs: 7n * 24n * 60n * 60n * 1000n,
  statutoryHoldingPeriodMs: 30n * 24n * 60n * 60n * 1000n,
  dualAppraisalThreshold: Money.of(10_000_000n, currencyOf('AUD')),
  notesTransferable: false,
};

@Global()
@Module({
  providers: [{ provide: PROTOCOL_PARAMETERS, useValue: demoParameters }],
  exports: [PROTOCOL_PARAMETERS],
})
export class ProtocolParametersModule {}
