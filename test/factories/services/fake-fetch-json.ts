import type { FetchJson } from '../../../src/types/context.js';

/**
 * Plain JSON fetch stub (no JSON-LD envelope).
 */
export function FakeFetchJson(urlMap: Record<string, unknown>): FetchJson {
  return async (url: string) => {
    if (!Object.prototype.hasOwnProperty.call(urlMap, url)) {
      throw new Error(`No fake response for URL: ${url}`);
    }
    return urlMap[url];
  };
}
