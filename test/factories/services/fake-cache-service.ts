import type { CacheService } from '../../../src/services/cache-service/cache-service.js';

/**
 * Fake {@link CacheService} for tests.
 *
 * TTL is ignored — entries never expire in-process.
 * Useful for testing caching behavior without time manipulation.
 */
export function FakeCacheService(): CacheService {
  const map = new Map<string, unknown>();

  return {
    async get(key: string) {
      return map.get(key);
    },

    async set(key: string, value: unknown) {
      map.set(key, value);
    }
  };
}

export type FakeCacheService = ReturnType<typeof FakeCacheService>;
