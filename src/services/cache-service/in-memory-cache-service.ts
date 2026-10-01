import type { CacheService } from './cache-service.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number | undefined;
}

/**
 * In-memory {@link CacheService} with lazy TTL expiry.
 *
 * Entries are stored with an optional expiration time. On `get`, expired
 * entries are automatically removed and treated as cache misses.
 *
 * TTL is checked on access only — no background timers or sweeps.
 */
export function InMemoryCacheService(): CacheService {
  const map = new Map<string, CacheEntry>();

  return {
    async get(key: string): Promise<unknown | undefined> {
      const entry = map.get(key);

      if (entry === undefined) {
        return undefined;
      }

      // Check expiration
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        map.delete(key);
        return undefined;
      }

      return entry.value;
    },

    async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
      const expiresAt =
        ttlMs !== undefined && ttlMs > 0 ? Date.now() + ttlMs : undefined;
      map.set(key, { value, expiresAt });
    }
  };
}

export type InMemoryCacheServiceType = ReturnType<typeof InMemoryCacheService>;
