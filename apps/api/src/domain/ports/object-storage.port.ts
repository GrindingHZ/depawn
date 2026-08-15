/* Evidence files live off chain in every phase; the intake record holds only
   their content hashes. Phase 1 writes to the local filesystem, a bucket
   store is a drop in adapter swap. */
export interface ObjectStoragePort {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export const OBJECT_STORAGE_PORT = Symbol('ObjectStoragePort');
