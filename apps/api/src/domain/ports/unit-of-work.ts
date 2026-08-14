/* Opaque marker for the transaction context. The Prisma adapter carries a
   transaction client behind it in Phase 1; the Sui adapter carries a
   transaction builder in Phase 3. Domain and application code never look
   inside, they only pass it through. */
export interface UnitOfWorkContext {
  readonly driver: string;
}

export interface UnitOfWork {
  run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
