import { DomainError } from '../shared/domain-error';

export class ReceiptNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No receipt exists with this id.');
  }
}
