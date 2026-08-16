import { Global, Module } from '@nestjs/common';
import { AUDIT_PORT } from '../domain/ports/audit.port';
import { DOMAIN_EVENT_PUBLISHER } from '../domain/ports/domain-event-publisher.port';
import { OBJECT_STORAGE_PORT } from '../domain/ports/object-storage.port';
import { PrismaAuditAdapter } from './audit/prisma-audit.adapter';
import { OutboxDomainEventPublisher } from './events/outbox-domain-event-publisher';
import {
  LoggingOutboxHandler,
  OUTBOX_HANDLER,
  OutboxDrainWorker,
} from './events/outbox-drain.worker';
import { FilesystemObjectStorageAdapter } from './storage/filesystem-object-storage.adapter';

@Global()
@Module({
  providers: [
    { provide: AUDIT_PORT, useClass: PrismaAuditAdapter },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxDomainEventPublisher },
    { provide: OBJECT_STORAGE_PORT, useClass: FilesystemObjectStorageAdapter },
    { provide: OUTBOX_HANDLER, useClass: LoggingOutboxHandler },
    OutboxDrainWorker,
  ],
  exports: [AUDIT_PORT, DOMAIN_EVENT_PUBLISHER, OBJECT_STORAGE_PORT, OutboxDrainWorker],
})
export class PlatformServicesModule {}
