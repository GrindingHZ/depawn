import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { ProtocolParameters } from '../../domain/marketplace/protocol-parameters';
import { Instant } from '../../domain/shared/instant';
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
export class ProtocolParametersRegistry implements OnModuleInit {
  private versions: ParameterVersion[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const rows = await this.prisma.protocolParameterVersion.findMany({
      orderBy: { effectiveAt: 'asc' },
    });
    this.versions = rows.map((row) => ({
      id: row.id,
      effectiveAt: Instant.fromEpochMilliseconds(BigInt(row.effectiveAt.getTime())),
      writtenByAccountId: row.writtenByAccountId,
      parameters: fromStoredParameters(row.parameters as unknown as StoredParameters),
    }));
  }

  current(): ProtocolParameters {
    return versionInForce(this.versions, this.clock.now(), demoParameters);
  }

  history(): readonly ParameterVersion[] {
    return this.versions;
  }

  /* Writing a version is the only way parameters change, so the refresh
     happens here rather than on a timer that could serve a stale answer. */
  async write(
    parameters: ProtocolParameters,
    effectiveAt: Instant,
    writtenByAccountId: string,
    id: string,
  ): Promise<void> {
    await this.prisma.protocolParameterVersion.create({
      data: {
        id,
        effectiveAt: new Date(Number(effectiveAt.epochMilliseconds)),
        writtenByAccountId,
        parameters: toStoredParameters(parameters) as unknown as object,
      },
    });
    await this.refresh();
  }
}
