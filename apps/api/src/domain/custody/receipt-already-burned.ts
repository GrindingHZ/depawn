import { DomainError } from '../shared/domain-error';

export class ReceiptAlreadyBurned extends DomainError {
  readonly code = 'RECEIPT_ALREADY_BURNED';

  constructor() {
    super('The receipt was already burned.');
  }
}
