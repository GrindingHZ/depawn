import { DomainError } from '../shared/domain-error';

export class IntakeIncomplete extends DomainError {
  readonly code = 'INTAKE_INCOMPLETE';

  constructor(message: string) {
    super(message);
  }
}
