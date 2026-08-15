import { DomainError } from '../shared/domain-error';

export class VaultNotFound extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('No vault exists with this id.');
  }
}
