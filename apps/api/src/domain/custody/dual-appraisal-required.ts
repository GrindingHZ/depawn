import { DomainError } from '../shared/domain-error';

export class DualAppraisalRequired extends DomainError {
  readonly code = 'DUAL_APPRAISAL_REQUIRED';

  constructor() {
    super('A second independent appraisal is required before sealing.');
  }
}
