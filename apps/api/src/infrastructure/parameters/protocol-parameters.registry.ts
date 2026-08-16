import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import type {
  ProtocolParametersPort,
  ProtocolParameterVersion,
} from '../../domain/ports/protocol-parameters.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { accountIdOf } from '../../domain/shared/identifiers';
import { Instant } from '../../domain/shared/instant';
import { transactionOf } from '../persistence/prisma-unit-of-work';
import { PrismaService } from '../persistence/prisma.service';
import { demoParameters } from './demo-parameters';
import {
  fromStoredParameters,
  toStoredParameters,
  versionInForce,
} from './protocol-parameter-versions';
import type { ParameterVersion, StoredParameters } from './protocol-parameter-versions';

/* Holds every version in memory and answers with the one in force. Reads are
   synchronous because every use case already reads the parameters object
   directly; making them asynchronous would touch every caller for nothing.
   The list is small by nature: it grows only when an operator edits it. */
@Injectable()
export class ProtocolParametersRegistry implements ProtocolParametersPort, OnModuleInit {
  private versions: ParameterVersion[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /* Named reload on the port and refresh here for the callers that predate
     it; both are the same read. */
  reload(): Promise<void> {
    return this.refresh();
  }

  async refresh(): Promise<void> {
    const rows = await this.prisma.protocolParameterVersion.findMany({
      orderBy: { effectiveAt: 'asc' },
    });
    this.versions = rows.map((row) => ({
      id: row.id,
      effectiveAt: Instant.fromEpochMilliseconds(BigInt(row.effectiveAt.getTime())),
      writtenByAccountId: accountIdOf(row.writtenByAccountId),
      parameters: fromStoredParameters(row.parameters as unknown as StoredParameters),
    }));
  }

  current(): ProtocolParameters {
    return versionInForce(this.versions, this.clock.now(), demoParameters);
  }

  history(): readonly ParameterVersion[] {
    return this.versions;
  }

  /* The row is written through the caller's transaction so the version and
     its audit entry commit together. The in memory copy is not touched here:
     the transaction may still roll back, so the reload belongs after the
     commit and the use case is what calls it. */
  async writeVersion(version: ProtocolParameterVersion, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).protocolParameterVersion.create({
      data: {
        id: version.id,
        effectiveAt: new Date(Number(version.effectiveAt.epochMilliseconds)),
        writtenByAccountId: version.writtenByAccountId,
        parameters: toStoredParameters(version.parameters) as unknown as object,
      },
    });
  }
}
