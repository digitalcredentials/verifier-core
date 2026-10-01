/**
 * Cache service interface for domain-level caching (e.g. registry payloads).
 * TTL is in milliseconds when supported by the store.
 */
export interface CacheService {
  /**
   * Get a value from the cache.
   * @param key - Cache key
   * @returns The cached value, or undefined if not found or expired
   */
  get: (key: string) => Promise<unknown | undefined>;

  /**
   * Set a value in the cache with optional TTL.
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Optional time-to-live in milliseconds
   */
  set: (key: string, value: unknown, ttlMs?: number) => Promise<void>;
}
