import { Inject, Injectable } from '@nestjs/common';
import type { Account } from '../../../domain/accounts/account';
import { OBJECT_STORAGE_PORT } from '../../../domain/ports/object-storage.port';
import type { ObjectStoragePort } from '../../../domain/ports/object-storage.port';
import type { ReceiptId } from '../../../domain/shared/identifiers';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface ReceiptPhotograph {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly contentHash: string;
}

interface StoredEvidence {
  readonly label?: unknown;
  readonly contentHash?: unknown;
  readonly contentType?: unknown;
}

/* Who may look at a photograph of somebody else's property:

   - the holder, always, because it is theirs
   - vault staff and operations, because custody is their job
   - anybody signed in, but only while the item is on a published listing,
     because that is the point at which the owner offered it to the market

   An item resting privately in the vault is nobody else's business, which is
   why this is not simply "any signed in account". */
@Injectable()
export class ReceiptPhotographQuery {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
  ) {}

  async findVisibleTo(receiptId: ReceiptId, viewer: Account): Promise<ReceiptPhotograph | null> {
    const receipt = await this.prisma.custodyReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, holderAccountId: true, intakeRecordHash: true },
    });
    if (receipt === null) {
      return null;
    }

    if (!(await this.mayView(receipt.id, receipt.holderAccountId, viewer))) {
      return null;
    }

    /* The receipt records the hash of the intake it was issued from, which is
       the only link back to the evidence the photograph was attached to. */
    const intake = await this.prisma.intakeRecord.findFirst({
      where: { sealedHash: receipt.intakeRecordHash },
      select: { id: true, evidence: true },
    });
    if (intake === null) {
      return null;
    }

    const evidence = Array.isArray(intake.evidence) ? (intake.evidence as StoredEvidence[]) : [];
    const photograph = evidence.find(
      (item) => typeof item.contentHash === 'string' && typeof item.contentType === 'string',
    );
    // Evidence recorded before uploads were verified has no type. Refusing is
    // the only safe answer: guessing is how a stored script gets served.
    if (photograph === undefined) {
      return null;
    }

    const contentHash = String(photograph.contentHash);
    const bytes = await this.storage.get(`intakes/${intake.id}/${contentHash}`);
    if (bytes === null) {
      return null;
    }
    return { bytes, contentType: String(photograph.contentType), contentHash };
  }

  private async mayView(
    receiptId: string,
    holderAccountId: string,
    viewer: Account,
  ): Promise<boolean> {
    if (holderAccountId === viewer.id) {
      return true;
    }
    if (viewer.hasRole('VAULT_STAFF') || viewer.hasRole('OPERATIONS')) {
      return true;
    }
    const published = await this.prisma.listing.count({
      where: { receiptId, status: { in: ['ACTIVE', 'MATCHED'] } },
    });
    return published > 0;
  }
}
