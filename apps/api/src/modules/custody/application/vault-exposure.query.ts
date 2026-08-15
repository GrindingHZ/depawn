import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import type { Vault } from '../../../domain/custody/vault';
import { VAULT_REPOSITORY } from '../../../domain/custody/vault-repository';
import type { VaultRepository } from '../../../domain/custody/vault-repository';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import type { VaultId } from '../../../domain/shared/identifiers';
import type { Money } from '../../../domain/shared/money';

export interface VaultExposure {
  readonly vault: Vault;
  readonly exposure: Money;
  readonly remaining: Money;
}

@Injectable()
export class VaultExposureQuery {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(VAULT_REPOSITORY) private readonly vaults: VaultRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
  ) {}

  read(vaultId: VaultId): Promise<VaultExposure | null> {
    return this.unitOfWork.run(async (context) => {
      const vault = await this.vaults.findById(vaultId, context);
      if (vault === null) {
        return null;
      }
      const exposure = await this.receipts.exposureOf(
        vaultId,
        vault.insuredLimit.currency,
        context,
      );
      return { vault, exposure, remaining: vault.insuredLimit.minus(exposure) };
    });
  }
}
