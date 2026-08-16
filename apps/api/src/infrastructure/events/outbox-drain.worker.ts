import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import { PrismaService } from '../persistence/prisma.service';

export interface OutboxHandler {
  publish(event: { id: string; type: string; payload: unknown }): Promise<void>;
}

export const OUTBOX_HANDLER = Symbol('OutboxHandler');

/* Phase 1 has nowhere to publish to, so delivery is a log line. The point of
   building it now is the machinery around it: Phase 3 swaps this for the
   chain submission and inherits the claiming, the retry, and the dead letter
   table rather than inventing a queue at the worst moment. */
@Injectable()
export class LoggingOutboxHandler implements OutboxHandler {
  private readonly logger = new Logger(LoggingOutboxHandler.name);

  publish(event: { id: string; type: string }): Promise<void> {
    this.logger.log(`published ${event.type} ${event.id}`);
    return Promise.resolve();
  }
}

export const maximumAttempts = 5;

/* How long a claim holds before another worker may retry the row. Long
   enough that a slow publish is not duplicated, short enough that a dead
   worker's batch is not stranded. */
export const claimVisibilityMs = 60_000;

@Injectable()
export class OutboxDrainWorker implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxDrainWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOX_HANDLER) private readonly handler: OutboxHandler,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  /* Started explicitly rather than on module init, so a test suite never
     inherits a timer it did not ask for and no drain runs inside a request. */
  start(intervalMs: number): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.drainOnce().catch((error: unknown) => {
        this.logger.error(`the outbox drain failed: ${String(error)}`);
      });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /* Claims a batch and stamps it, so two workers draining at once publish
     disjoint sets. The row lock alone is not enough: it only reserves for the
     life of its transaction, so the moment the claim committed a second
     drain could take the same rows again. The stamp is what survives the
     commit, and it expires so a worker that dies mid publish does not strand
     its batch forever. */
  async drainOnce(batchSize = 20): Promise<number> {
    const now = new Date(Number(this.clock.now().epochMilliseconds));
    const claimableFrom = new Date(now.getTime() - claimVisibilityMs);
    const claimed = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        { id: string; type: string; payload: unknown; attempts: number }[]
      >`
        SELECT id, type, payload, attempts
        FROM outbox_event
        WHERE published_at IS NULL
          AND (claimed_at IS NULL OR claimed_at < ${claimableFrom})
        ORDER BY id ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length > 0) {
        await transaction.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { attempts: { increment: 1 }, claimedAt: now },
        });
      }
      return rows;
    });

    let delivered = 0;
    for (const event of claimed) {
      try {
        await this.handler.publish(event);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date(Number(this.clock.now().epochMilliseconds)) },
        });
        delivered += 1;
      } catch (error: unknown) {
        await this.recordFailure(event, error);
      }
    }
    return delivered;
  }

  /* An event that has exhausted its attempts leaves the queue so the queue
     keeps moving, and waits for a human in the dead letter table. */
  private async recordFailure(
    event: { id: string; type: string; payload: unknown; attempts: number },
    error: unknown,
  ): Promise<void> {
    const attempts = event.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    if (attempts < maximumAttempts) {
      // Release the claim so the next drain can retry it rather than
      // waiting out the visibility window.
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { claimedAt: null },
      });
      this.logger.warn(`event ${event.id} failed on attempt ${attempts}: ${message}`);
      return;
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.deadLetterEvent.create({
        data: {
          id: event.id,
          outboxId: event.id,
          type: event.type,
          payload: event.payload as object,
          attempts,
          lastError: message,
          deadLetteredAt: new Date(Number(this.clock.now().epochMilliseconds)),
        },
      });
      await transaction.outboxEvent.delete({ where: { id: event.id } });
    });
    this.logger.error(`event ${event.id} dead lettered after ${attempts} attempts: ${message}`);
  }
}
