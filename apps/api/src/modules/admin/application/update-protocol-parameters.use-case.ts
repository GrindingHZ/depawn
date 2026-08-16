import { Inject, Injectable } from '@nestjs/common';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { PROTOCOL_PARAMETERS_PORT } from '../../../domain/ports/protocol-parameters.port';
import type {
  ProtocolParametersPort,
  ProtocolParameterVersion,
} from '../../../domain/ports/protocol-parameters.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import type { AccountId } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';

export interface UpdateProtocolParametersCommand {
  readonly requestedBy: AccountId;
  readonly effectiveAt: Instant;
  readonly parameters: ProtocolParameters;
}

export interface ProtocolParametersView {
  readonly current: ProtocolParameters;
  readonly history: readonly ProtocolParameterVersion[];
}

/* Flow 11. An edit writes a version rather than changing the current one, so
   a loan already originated keeps the terms it was originated under. The
   version and its audit entry are one transaction: an edit nobody can trace
   back to an operator is worse than no edit. */
@Injectable()
export class UpdateProtocolParametersUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(PROTOCOL_PARAMETERS_PORT) private readonly parameters: ProtocolParametersPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  read(): ProtocolParametersView {
    return { current: this.parameters.current(), history: this.parameters.history() };
  }

  async execute(command: UpdateProtocolParametersCommand): Promise<ProtocolParametersView> {
    const version: ProtocolParameterVersion = {
      id: this.idGenerator.generate(),
      effectiveAt: command.effectiveAt,
      writtenByAccountId: command.requestedBy,
      parameters: command.parameters,
    };
    const before = this.parameters.current();

    await this.unitOfWork.run(async (context) => {
      await this.parameters.writeVersion(version, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'protocol_parameters',
          subjectId: version.id,
          action: 'update_protocol_parameters',
          before: describe(before),
          after: {
            effectiveAt: new Date(Number(command.effectiveAt.epochMilliseconds)).toISOString(),
            ...describe(command.parameters),
          },
        },
        context,
      );
    });

    // Only now, because a rollback would otherwise leave the served copy
    // holding a version that never committed.
    await this.parameters.reload();
    return this.read();
  }
}

/* The audit entry is JSON, so the bigints and the Money have to be written
   out deliberately rather than handed to a serialiser that would throw. */
function describe(parameters: ProtocolParameters): Record<string, unknown> {
  return {
    maxLoanToValueBasisPointsByCategory: { ...parameters.maxLoanToValueBasisPointsByCategory },
    maxAnnualPercentageRateBasisPoints: parameters.maxAnnualPercentageRateBasisPoints,
    minimumOfferLifetimeMs: parameters.minimumOfferLifetimeMs.toString(),
    originationFeeBasisPoints: parameters.originationFeeBasisPoints,
    liquidationFeeBasisPoints: parameters.liquidationFeeBasisPoints,
    gracePeriodMs: parameters.gracePeriodMs.toString(),
    statutoryHoldingPeriodMs: parameters.statutoryHoldingPeriodMs.toString(),
    dualAppraisalThreshold: {
      minorUnits: parameters.dualAppraisalThreshold.minorUnits.toString(),
      currency: parameters.dualAppraisalThreshold.currency,
    },
    notesTransferable: parameters.notesTransferable,
  };
}
