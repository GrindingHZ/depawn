import { Injectable } from '@nestjs/common';
import type { Appraisal } from '../../../domain/custody/appraisal';
import type { AppraisalRepository } from '../../../domain/custody/appraisal-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { IntakeId } from '../../../domain/shared/identifiers';
import { toAppraisal } from '../mappers/custody.mapper';
import { transactionOf } from '../prisma-unit-of-work';

@Injectable()
export class PrismaAppraisalRepository implements AppraisalRepository {
  async listByIntake(
    intakeId: IntakeId,
    context: UnitOfWorkContext,
  ): Promise<readonly Appraisal[]> {
    const rows = await transactionOf(context).appraisal.findMany({
      where: { intakeId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toAppraisal);
  }

  async save(appraisal: Appraisal, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).appraisal.create({
      data: {
        id: appraisal.id,
        intakeId: appraisal.intakeId,
        appraiserId: appraisal.appraiserId,
        valueMinorUnits: appraisal.value.minorUnits,
        currency: appraisal.value.currency,
        method: appraisal.method,
        comparableReferences: appraisal.comparableReferences,
        appraisedAt: new Date(Number(appraisal.appraisedAt.epochMilliseconds)),
      },
    });
  }
}
