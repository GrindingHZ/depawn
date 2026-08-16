import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { SYSTEM_STATE_PORT } from '../../../domain/ports/system-state.port';
import type { SystemState, SystemStatePort } from '../../../domain/ports/system-state.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId } from '../../../domain/shared/identifiers';

export interface PauseSystemCommand {
  readonly requestedBy: AccountId;
  readonly reason: string;
}

/* Flow 11. Pausing and unpausing are both audited, because the question
   afterwards is always who stopped trading and why. */
@Injectable()
export class PauseSystemUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(SYSTEM_STATE_PORT) private readonly systemState: SystemStatePort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  pause(command: PauseSystemCommand): Promise<SystemState> {
    return this.unitOfWork.run(async (context) => {
      const state = await this.systemState.pause(
        { pausedBy: command.requestedBy, reason: command.reason, at: this.clock.now() },
        context,
      );
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'system',
          subjectId: 'SYSTEM',
          action: 'pause_system',
          after: { reason: command.reason },
        },
        context,
      );
      return state;
    });
  }

  unpause(requestedBy: AccountId): Promise<SystemState> {
    return this.unitOfWork.run(async (context) => {
      const before = await this.systemState.read(context);
      const state = await this.systemState.unpause(context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: requestedBy,
          subjectType: 'system',
          subjectId: 'SYSTEM',
          action: 'unpause_system',
          before: { reason: before.reason },
        },
        context,
      );
      return state;
    });
  }

  read(): Promise<SystemState> {
    return this.unitOfWork.run((context) => this.systemState.read(context));
  }
}
