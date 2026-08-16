import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface DeadLetterReadModel {
  readonly id: string;
  readonly type: string;
  readonly attempts: number;
  readonly lastError: string;
  readonly deadLetteredAt: string;
}

/* An event that gave up is only useful if someone can see it, so the queue's
   failures surface next to the other operations tools rather than in a table
   only a database client can reach. */
@Injectable()
export class DeadLetterQuery {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 50): Promise<readonly DeadLetterReadModel[]> {
    const rows = await this.prisma.deadLetterEvent.findMany({
      orderBy: { deadLetteredAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      attempts: row.attempts,
      lastError: row.lastError,
      deadLetteredAt: row.deadLetteredAt.toISOString(),
    }));
  }
}
