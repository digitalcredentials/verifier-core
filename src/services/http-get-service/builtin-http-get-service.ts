import type { HttpGetResult } from '../../types/http.js';
import type { HttpGetService } from './http-get-service.js';

/**
 * `fetch`-based {@link HttpGetService}.
 *
 * Parses response body as JSON when Content-Type suggests JSON,
 * otherwise returns text. Returns status and headers for caller
 * to handle non-2xx responses.
 */
export function BuiltinHttpGetService(): HttpGetService {
  return {
    async get(url: string): Promise<HttpGetResult> {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') ?? '';

      let body: unknown;
      if (/json/i.test(contentType)) {
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
      } else {
        body = await response.text();
      }

      return { body, headers: response.headers, status: response.status };
    }
  };
}

export type BuiltinHttpGetServiceType = ReturnType<
  typeof BuiltinHttpGetService
>;
