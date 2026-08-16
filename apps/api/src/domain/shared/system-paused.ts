import { DomainError } from './domain-error';

/* Raised only by the flows rule S1 names. Anything that returns money or
   collateral to its owner must never raise it (rule S2). */
export class SystemPaused extends DomainError {
  readonly code = 'SYSTEM_PAUSED';

  constructor() {
    super('The system is paused and is not accepting new business.');
  }
}
