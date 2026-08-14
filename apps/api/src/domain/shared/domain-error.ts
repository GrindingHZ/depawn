export abstract class DomainError {
  abstract readonly code: string;

  constructor(readonly message: string) {}
}
