import { DomainError } from '../shared/domain-error';

export class ReceiptAlreadyListed extends DomainError {
  readonly code = 'RECEIPT_ALREADY_LISTED';

  constructor() {
    super('This receipt already has a live listing.');
  }
}
