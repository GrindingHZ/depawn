import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Instant } from '../../domain/shared/instant';
import { PrismaService } from '../persistence/prisma.service';
import type { AdvanceableClock } from './advanceable-clock';

const singletonId = 'DEMO';

/* The demo clock outlives the process that moved it. The seed spreads a loan
   book across weeks by advancing time, and the process that later serves the
   demo has to be born at the same instant, or every loan the seed wrote would
   appear to start in the future. The offset therefore lives in the database
   and is read once at startup; reads stay synchronous because every use case
   reads the clock directly. */
@Injectable()
export class DemoClockAdapter implements AdvanceableClock, OnModuleInit {
  private offsetMilliseconds = 0n;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const row = await this.prisma.demoClock.findUnique({ where: { id: singletonId } });
    this.offsetMilliseconds = row === null ? 0n : row.offsetMs;
  }

  now(): Instant {
    return Instant.fromEpochMilliseconds(BigInt(Date.now()) + this.offsetMilliseconds);
  }

  async advanceBy(milliseconds: bigint): Promise<void> {
    if (milliseconds < 0n) {
      throw new RangeError('The clock cannot move backwards');
    }
    await this.persist(this.offsetMilliseconds + milliseconds);
  }

  async reset(): Promise<void> {
    await this.persist(0n);
  }

  get offset(): bigint {
    return this.offsetMilliseconds;
  }

  private async persist(offsetMilliseconds: bigint): Promise<void> {
    await this.prisma.demoClock.upsert({
      where: { id: singletonId },
      update: { offsetMs: offsetMilliseconds },
      create: { id: singletonId, offsetMs: offsetMilliseconds },
    });
    this.offsetMilliseconds = offsetMilliseconds;
  }
}
