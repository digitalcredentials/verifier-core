/**
 * Key-value cache port for domain-level caching (e.g. registry payloads).
 * TTL is in milliseconds when supported by the store.
 */
export interface CacheStore {
  get: (key: string) => Promise<unknown | undefined>;
  set: (key: string, value: unknown, ttl?: number) => Promise<void>;
}
