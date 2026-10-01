/**
 * Plain HTTP GET port — used to unify remote fetching for JSON-LD, JSON Schema,
 * and registry payloads when callers inject a cached implementation.
 */

/**
 * Result of HTTP GET. Includes status so callers can branch on 404 vs 5xx.
 */
export interface HttpGetResult {
  /** Response body — JSON parsed as object/array when Content-Type is JSON, else text. */
  body: unknown;
  headers: Headers;
  status: number;
}
