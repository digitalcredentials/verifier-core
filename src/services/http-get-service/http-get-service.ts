import type { HttpGetResult } from '../../types/http.js';

/**
 * HTTP GET service interface.
 *
 * Abstracts HTTP fetching for registry lookups, JSON-LD document loading,
 * and JSON Schema fetching. Implementations may add caching, retries, etc.
 */
export interface HttpGetService {
  /**
   * Fetch a URL and return body + metadata.
   * @param url - URL to fetch
   * @returns Result with body (JSON parsed when Content-Type suggests), headers, status
   */
  get: (url: string) => Promise<HttpGetResult>;
}
