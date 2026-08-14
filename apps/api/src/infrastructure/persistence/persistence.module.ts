import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../domain/ports/unit-of-work';
import { PrismaService } from './prisma.service';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
  ],
  exports: [PrismaService, PrismaUnitOfWork, UNIT_OF_WORK],
})
export class PersistenceModule {}
