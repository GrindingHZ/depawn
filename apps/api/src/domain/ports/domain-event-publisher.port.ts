import type { DomainEvent } from '../shared/domain-event';
import type { UnitOfWorkContext } from './unit-of-work';

/* Phase 1 writes to an outbox table inside the same transaction; Phase 3
   events come back from the chain through the indexer. */
export interface DomainEventPublisher {
  publish(events: DomainEvent[], context: UnitOfWorkContext): Promise<void>;
}

export const DOMAIN_EVENT_PUBLISHER = Symbol('DomainEventPublisher');
