import { DomainError } from '../shared/domain-error';

export class ReceiptNotEncumbered extends DomainError {
  readonly code = 'RECEIPT_NOT_ENCUMBERED';

  constructor() {
    super('The receipt does not secure a loan.');
  }
}
