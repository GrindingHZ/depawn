import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { ReceiptNotFound } from '../../../domain/marketplace/receipt-not-found';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { RedemptionRequest } from '../../../domain/custody/redemption-request';
import { REDEMPTION_REQUEST_REPOSITORY } from '../../../domain/custody/redemption-request-repository';
import type { RedemptionRequestRepository } from '../../../domain/custody/redemption-request-repository';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { CUSTODY_PORT } from '../../../domain/ports/custody.port';
import type { CustodyPort } from '../../../domain/ports/custody.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { redemptionRequestIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ReceiptId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';

export interface RequestRedemptionCommand {
  readonly receiptId: ReceiptId;
  readonly requestedBy: AccountId;
}

/* Flow 6 step 1. The receipt burns here, at request time, not at the
   counter: the burn is the entitlement proof and the visit is only identity
   verification. Burning also drops the item out of the derived vault
   exposure, which is what flow 6 step 4 asks for. */
@Injectable()
export class RequestRedemptionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(REDEMPTION_REQUEST_REPOSITORY)
    private readonly requests: RedemptionRequestRepository,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    command: RequestRedemptionCommand,
  ): Promise<Result<RedemptionRequest, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        const receipt = await this.receipts.findById(command.receiptId, context);
        if (receipt === null) {
          return failure(new ReceiptNotFound());
        }
        // Holder based, not borrower based, so a lender who claimed the
        // receipt after a default redeems through this same flow.
        if (receipt.holderAccountId !== command.requestedBy) {
          return failure(new NotResourceOwner());
        }

        const now = this.clock.now();
        await this.custody.burnReceipt(receipt.id, 'REDEMPTION', context);

        const request = RedemptionRequest.open({
          id: redemptionRequestIdOf(this.idGenerator.generate()),
          receiptId: receipt.id,
          vaultId: receipt.vaultId,
          requestedByAccountId: command.requestedBy,
          requestedAt: now,
        });
        await this.requests.save(request, context);

        await this.events.publish(
          [
            {
              type: 'RedemptionRequested',
              receiptId: receipt.id,
              requestedBy: command.requestedBy,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'redemption_request',
            subjectId: request.id,
            action: 'request_redemption',
            before: { receiptStatus: receipt.status },
            after: { receiptId: receipt.id, vaultId: receipt.vaultId },
          },
          context,
        );
        return ok(request);
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
