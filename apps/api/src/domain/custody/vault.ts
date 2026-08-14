import type { VaultId } from '../shared/identifiers';
import type { Money } from '../shared/money';

export class Vault {
  private constructor(
    readonly id: VaultId,
    readonly name: string,
    readonly city: string,
    readonly insuredLimit: Money,
    readonly version: number,
  ) {}

  static create(input: { id: VaultId; name: string; city: string; insuredLimit: Money }): Vault {
    return new Vault(input.id, input.name, input.city, input.insuredLimit, 0);
  }

  static restore(input: {
    id: VaultId;
    name: string;
    city: string;
    insuredLimit: Money;
    version: number;
  }): Vault {
    return new Vault(input.id, input.name, input.city, input.insuredLimit, input.version);
  }
}
