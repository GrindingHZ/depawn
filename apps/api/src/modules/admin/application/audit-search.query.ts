import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface AuditSearchFilters {
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly actorId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface AuditEntryReadModel {
  readonly id: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly recordedAt: string;
}

export interface AuditPage {
  readonly items: readonly AuditEntryReadModel[];
  readonly nextCursor: string | null;
}

/* The audit trail is append only and read by people investigating a single
   subject, so the filters compose and the cursor walks backwards through
   monotonic ids rather than through timestamps that can tie. */
@Injectable()
export class AuditSearchQuery {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: AuditSearchFilters): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.subjectType === undefined ? {} : { subjectType: filters.subjectType }),
        ...(filters.subjectId === undefined ? {} : { subjectId: filters.subjectId }),
        ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
        ...(filters.cursor === undefined ? {} : { id: { lt: filters.cursor } }),
      },
      orderBy: { id: 'desc' },
      take: filters.limit + 1,
    });

    const page = rows.slice(0, filters.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        action: row.action,
        before: row.before,
        after: row.after,
        recordedAt: row.occurredAt.toISOString(),
      })),
      nextCursor: rows.length > filters.limit && last !== undefined ? last.id : null,
    };
  }
}
