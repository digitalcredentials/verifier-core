import type { HttpGetResult } from '../../../src/types/http.js';
import type { HttpGetService } from '../../../src/services/http-get-service/http-get-service.js';

export type FakeHttpGetServiceOptions = {
  /** Called for every GET (after map lookup fails if no map entry). */
  fallback?: HttpGetService;
};

/**
 * Test double: URL → fixed {@link HttpGetResult} (status 200 by default).
 * Throws if URL unmapped and no fallback.
 *
 * Records every `get(url)` invocation, exposed via `callsTo(url)` and
 * `allCalls()`. The recording happens before the urlMap lookup or
 * fallback dispatch, so the count reflects what the caller asked for —
 * higher-layer cache hits that short-circuit before reaching this
 * service are correctly observed as a count of zero.
 */
export function FakeHttpGetService(
  urlMap: Record<string, HttpGetResult>,
  options: FakeHttpGetServiceOptions = {}
): HttpGetService & {
  /** Number of times `get(url)` was invoked for the given URL. */
  callsTo: (url: string) => number;
  /** All URLs requested, in order. */
  allCalls: () => string[];
} {
  const { fallback } = options;
  const calls: string[] = [];

  return {
    async get(url: string): Promise<HttpGetResult> {
      calls.push(url);
      if (Object.prototype.hasOwnProperty.call(urlMap, url)) {
        return urlMap[url];
      }
      if (fallback !== undefined) {
        return fallback.get(url);
      }
      throw new Error(`No fake HttpGetService for URL: ${url}`);
    },
    callsTo(url: string): number {
      return calls.filter(c => c === url).length;
    },
    allCalls(): string[] {
      return [...calls];
    }
  };
}

export type FakeHttpGetService = ReturnType<typeof FakeHttpGetService>;

/** Build a 200 OK result with JSON body and empty Headers. */
export function okJsonBody(body: unknown): HttpGetResult {
  return { body, headers: new Headers(), status: 200 };
}

/** Build an {@link HttpGetResult} with arbitrary status (e.g. 404, 503). */
export function httpGetResult(
  status: number,
  body: unknown,
  headers: Headers = new Headers()
): HttpGetResult {
  return { body, headers, status };
}
