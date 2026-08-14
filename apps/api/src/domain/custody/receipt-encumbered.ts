import { DomainError } from '../shared/domain-error';

export class ReceiptEncumbered extends DomainError {
  readonly code = 'RECEIPT_ENCUMBERED';

  constructor() {
    super('The receipt secures a loan and cannot move.');
  }
}
