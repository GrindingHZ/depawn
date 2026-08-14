import { DomainError } from '../shared/domain-error';

export class ReceiptNotInVault extends DomainError {
  readonly code = 'RECEIPT_NOT_IN_VAULT';

  constructor() {
    super('The receipt is not held in the vault.');
  }
}
