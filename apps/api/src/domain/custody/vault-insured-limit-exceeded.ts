import { DomainError } from '../shared/domain-error';

export class VaultInsuredLimitExceeded extends DomainError {
  readonly code = 'VAULT_INSURED_LIMIT_EXCEEDED';

  constructor() {
    super('Issuing this receipt would push the vault past its insured limit.');
  }
}
