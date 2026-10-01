import type { DocumentLoader } from '../../../src/types/context.js';

export type FakeDocumentLoaderOptions = {
  fallback?: DocumentLoader;
};

/**
 * JSON-LD document loader backed by a URL → document map.
 *
 * Returns the same envelope shape as `security-document-loader`:
 * `{ contextUrl: null, document, documentUrl }`.
 */
export function FakeDocumentLoader(
  urlMap: Record<string, unknown>,
  options: FakeDocumentLoaderOptions = {}
): DocumentLoader {
  const { fallback } = options;

  return async (url: string) => {
    if (Object.prototype.hasOwnProperty.call(urlMap, url)) {
      return {
        contextUrl: null,
        document: urlMap[url],
        documentUrl: url
      };
    }
    if (fallback !== undefined) {
      return await fallback(url);
    }
    throw new Error(`Document not found: ${url}`);
  };
}
