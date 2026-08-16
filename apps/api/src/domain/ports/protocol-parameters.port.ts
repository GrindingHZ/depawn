import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import type { Instant } from '../shared/instant';
import type { AccountId } from '../shared/identifiers';
import type { UnitOfWorkContext } from './unit-of-work';

export interface ProtocolParameterVersion {
  readonly id: string;
  readonly effectiveAt: Instant;
  readonly writtenByAccountId: AccountId;
  readonly parameters: ProtocolParameters;
}

/* Reads are synchronous because every use case reads the parameters object
   directly and an adapter is free to hold the small set of versions in
   memory. The write takes a context so the new version and its audit entry
   commit together, and reload exists because whatever serves the reads has to
   be told the write landed. Phase 3 backs this with a shared Config object
   mutated through an AdminCap. */
export interface ProtocolParametersPort {
  current(): ProtocolParameters;
  history(): readonly ProtocolParameterVersion[];
  writeVersion(version: ProtocolParameterVersion, context: UnitOfWorkContext): Promise<void>;
  reload(): Promise<void>;
}

export const PROTOCOL_PARAMETERS_PORT = Symbol('ProtocolParametersPort');
