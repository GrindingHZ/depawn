import { DomainError } from '../shared/domain-error';

/* Carries the reason, because "we did not accept your photograph" without
   saying why leaves staff at the counter guessing with a customer waiting. */
export class PhotographRejected extends DomainError {
  readonly code = 'VALIDATION_FAILED';

  constructor(reason: string) {
    super(reason);
  }
}
