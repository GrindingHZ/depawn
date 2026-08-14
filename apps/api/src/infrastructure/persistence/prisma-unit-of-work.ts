import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UnitOfWork, UnitOfWorkContext } from '../../domain/ports/unit-of-work';
import { PrismaService } from './prisma.service';

export class PrismaUnitOfWorkContext implements UnitOfWorkContext {
  constructor(readonly transaction: Prisma.TransactionClient) {}
}

export function transactionOf(context: UnitOfWorkContext): Prisma.TransactionClient {
  if (!(context instanceof PrismaUnitOfWorkContext)) {
    throw new Error('The unit of work context does not carry a Prisma transaction');
  }
  return context.transaction;
}

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) =>
      work(new PrismaUnitOfWorkContext(transaction)),
    );
  }
}
