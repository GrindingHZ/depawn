import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CLOCK_PORT } from '../../domain/ports/clock.port';
import type { ClockPort } from '../../domain/ports/clock.port';
import type { DomainEventPublisher } from '../../domain/ports/domain-event-publisher.port';
import type { UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../domain/shared/id-generator';
import type { IdGenerator } from '../../domain/shared/id-generator';
import type { DomainEvent } from '../../domain/shared/domain-event';
import { transactionOf } from '../persistence/prisma-unit-of-work';

/* Events land in the outbox inside the same transaction as the state change,
   so an event exists exactly when its transaction committed. Phase 3 swaps
   this for chain events read back through the indexer. */
@Injectable()
export class OutboxDomainEventPublisher implements DomainEventPublisher {
  constructor(
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async publish(events: DomainEvent[], context: UnitOfWorkContext): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const occurredAt = new Date(Number(this.clock.now().epochMilliseconds));
    await transactionOf(context).outboxEvent.createMany({
      data: events.map((event) => ({
        id: this.idGenerator.generate(),
        type: event.type,
        payload: toPayload(event),
        occurredAt,
      })),
    });
  }
}

function toPayload(event: DomainEvent): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(event, (_key, raw: unknown) => (typeof raw === 'bigint' ? raw.toString() : raw)),
  ) as Prisma.InputJsonValue;
}
