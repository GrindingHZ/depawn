import { DomainError } from '../shared/domain-error';

export class IntakeAlreadySealed extends DomainError {
  readonly code = 'INTAKE_ALREADY_SEALED';

  constructor() {
    super('The intake record is sealed and cannot change.');
  }
}
