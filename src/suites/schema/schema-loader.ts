import type { CacheService } from '../../services/cache-service/cache-service.js';
import type { FetchJson } from '../../types/context.js';

/**
 * TTL for a cached schema document (24 hours).
 *
 * The schemas this loader is allowed to cache are versioned and immutable in
 * practice, and {@link FetchJson} drops response headers, so a fixed long TTL
 * stands in for `Cache-Control`.
 */
export const SCHEMA_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `cacheService` key for a schema document. The cache is shared with registry
 * data, so schema entries carry their own prefix.
 */
export const schemaCacheKey = (url: string): string => `schema:${url}`;

const isJsonObject = (value: unknown): value is object =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Build an AJV `loadSchema` that caches schema JSON in `cacheService`.
 *
 * AJV calls the loader for the root schema and for every `$ref` it follows,
 * so caching here covers both. Only URLs accepted by `isCacheable` are cached:
 * a credential can name any schema URL, and caching those would let an issuer
 * grow the cache without bound. Other URLs, or every URL when there is no
 * `cacheService`, are fetched each time.
 *
 * Only a fetched JSON object is cached. `fetchJson` already throws on a non-2xx
 * response, and anything that is not a JSON object throws below, so neither
 * failure is ever stored. A cache hit that is not a JSON object is treated as
 * a miss.
 *
 * @param fetchJson - Plain JSON fetch used on a miss.
 * @param cacheService - Optional cache for schema documents.
 * @param isCacheable - Decides which schema URLs may be cached.
 */
export function createCachedSchemaLoader(
  fetchJson: FetchJson,
  cacheService: CacheService | undefined,
  isCacheable: (url: string) => boolean
): (url: string) => Promise<object> {
  return async (url: string): Promise<object> => {
    const cache =
      cacheService !== undefined && isCacheable(url) ? cacheService : undefined;

    if (cache) {
      const hit = await cache.get(schemaCacheKey(url));
      if (isJsonObject(hit)) {
        return hit;
      }
    }

    const doc = await fetchJson(url);
    if (!isJsonObject(doc)) {
      throw new Error(`Expected JSON object schema at ${url}`);
    }

    if (cache) {
      await cache.set(schemaCacheKey(url), doc, SCHEMA_TTL_MS);
    }
    return doc;
  };
}
