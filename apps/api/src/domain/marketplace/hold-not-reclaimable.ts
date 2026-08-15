import { DomainError } from '../shared/domain-error';

export class HoldNotReclaimable extends DomainError {
  readonly code = 'HOLD_NOT_RECLAIMABLE';

  constructor() {
    super('Only a superseded or expired offer hold can be reclaimed.');
  }
}
