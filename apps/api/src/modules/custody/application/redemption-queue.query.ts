import { Inject, Injectable } from '@nestjs/common';
import type {
  RedemptionRequest,
  RedemptionStatus,
} from '../../../domain/custody/redemption-request';
import { REDEMPTION_REQUEST_REPOSITORY } from '../../../domain/custody/redemption-request-repository';
import type { RedemptionRequestRepository } from '../../../domain/custody/redemption-request-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { AccountId, VaultId } from '../../../domain/shared/identifiers';

@Injectable()
export class RedemptionQueueQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(REDEMPTION_REQUEST_REPOSITORY)
    private readonly requests: RedemptionRequestRepository,
  ) {}

  listForRequester(accountId: AccountId): Promise<readonly RedemptionRequest[]> {
    return this.unitOfWork.run((context) => this.requests.listByRequester(accountId, context));
  }

  listForVault(
    vaultId: VaultId,
    statuses: readonly RedemptionStatus[],
  ): Promise<readonly RedemptionRequest[]> {
    return this.unitOfWork.run((context) => this.requests.listForVault(vaultId, statuses, context));
  }
}
