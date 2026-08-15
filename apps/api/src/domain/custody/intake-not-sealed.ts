import { DomainError } from '../shared/domain-error';

export class IntakeNotSealed extends DomainError {
  readonly code = 'INTAKE_NOT_SEALED';

  constructor() {
    super('Seal the intake record before issuing a receipt.');
  }
}
