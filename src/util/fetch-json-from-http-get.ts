import type { FetchJson } from '../types/context.js';
import type { HttpGetService } from '../services/http-get-service/http-get-service.js';

/** Plain JSON fetch that unwraps {@link HttpGetService} and enforces 2xx. */
export function fetchJsonFromHttpGet(
  httpGetService: HttpGetService
): FetchJson {
  return async (url: string) => {
    const { body, status } = await httpGetService.get(url);
    if (status < 200 || status >= 300) {
      throw new Error(`Failed to fetch ${url}: HTTP ${status}`);
    }
    return body;
  };
}
