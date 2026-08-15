import { Injectable } from '@nestjs/common';
import type { Vault } from '../../../domain/custody/vault';
import type { VaultRepository } from '../../../domain/custody/vault-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { VaultId } from '../../../domain/shared/identifiers';
import { toVault } from '../mappers/custody.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleVaultVersionError extends Error {
  constructor(vaultId: string) {
    super(`Vault ${vaultId} was modified concurrently`);
    this.name = 'StaleVaultVersionError';
  }
}

@Injectable()
export class PrismaVaultRepository implements VaultRepository {
  async findById(id: VaultId, context: UnitOfWorkContext): Promise<Vault | null> {
    const row = await transactionOf(context).vault.findUnique({ where: { id } });
    return row === null ? null : toVault(row);
  }

  async save(vault: Vault, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const data = {
      name: vault.name,
      city: vault.city,
      insuredLimitMinorUnits: vault.insuredLimit.minorUnits,
      currency: vault.insuredLimit.currency,
    };
    const existing = await transaction.vault.findUnique({ where: { id: vault.id } });
    if (existing === null) {
      await transaction.vault.create({ data: { id: vault.id, ...data, version: 0 } });
      return;
    }
    const updated = await transaction.vault.updateMany({
      where: { id: vault.id, version: vault.version },
      data: { ...data, version: vault.version + 1 },
    });
    if (updated.count === 0) {
      throw new StaleVaultVersionError(vault.id);
    }
  }

  async lock(id: VaultId, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).$queryRaw`SELECT id FROM vault WHERE id = ${id} FOR UPDATE`;
  }
}
