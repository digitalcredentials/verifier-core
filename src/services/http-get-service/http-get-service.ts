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
   *
   * Implementations should throw on transport failure and return a result
   * for any HTTP status, so callers can branch on 404 vs 5xx.
   * @param url - URL to fetch
   * @returns Result with body (parsed JSON when the body is valid JSON, whatever the content type; otherwise the text), headers, status
   */
  get: (url: string) => Promise<HttpGetResult>;
}
