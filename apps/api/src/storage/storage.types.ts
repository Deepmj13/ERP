export interface StoredObject {
  key: string;
  size: number;
  contentType?: string;
}

export interface StorageProvider {
  readonly name: string;
  /** Writes a fresh object, overwriting on key collision (keys are caller-namespaced). */
  put(key: string, body: Buffer, contentType?: string): Promise<StoredObject>;
  /** Returns the object bytes, or null when the key is absent. */
  get(key: string): Promise<{ body: Buffer; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  /** Pre-signed read URL for browsers; implementations may throw if unsupported. */
  signedUrl?(key: string, expiresInSec: number): Promise<string>;
}

/** Policy keys resolve to `tenantId/entityType/entityId/<token>` (plan §13). */
export function buildKey(
  tenantId: string,
  entityType: string,
  entityId: string,
  suffix: string,
): string {
  return [tenantId, entityType, entityId, suffix].filter(Boolean).join('/');
}
