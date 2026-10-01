import { securityLoader } from '@digitalcredentials/security-document-loader';
import { CachedResolver } from '@digitalcredentials/did-io';
import * as didKey from '@digitalcredentials/did-method-key';
import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey';
import * as EcdsaMultikey from '@interop/ecdsa-multikey';
import type { DocumentLoader } from '../types/context.js';
import type { HttpGetService } from '../services/http-get-service/http-get-service.js';
import { didWebDriverWithHttpGet } from './did-web-driver-with-http-get.js';

/**
 * Build a JSON-LD document loader that uses {@link securityLoader} for static
 * contexts and DID resolution, delegating http(s) remote documents to `httpGetService`.
 *
 * did:web resolution also uses `httpGetService` (stock `securityLoader` wires
 * `DidWebDriver` to `http-client`, which bypasses caller caching).
 */
export function documentLoaderFromHttpGet(
  httpGetService: HttpGetService
): DocumentLoader {
  const loader = securityLoader({ fetchRemoteContexts: true });

  const resolver = new CachedResolver();
  const didKeyDriver = didKey.driver();
  const didWebDriver = didWebDriverWithHttpGet(httpGetService);
  resolver.use(didKeyDriver);
  resolver.use(didWebDriver);
  didWebDriver.use({
    multibaseMultikeyHeader: 'z6Mk',
    fromMultibase: Ed25519Multikey.from
  });
  didKeyDriver.use({
    multibaseMultikeyHeader: 'z6Mk',
    fromMultibase: Ed25519Multikey.from
  });
  // ECDSA Multikey: P-256 (zDna) and P-384 (z82L) for ecdsa-rdfc-2019.
  // `@interop/ecdsa-multikey` ships strict types whose `from` parameter is
  // narrower than the driver's `(input: unknown) => unknown` contract; bind
  // once to that contract (runtime accepts the serialized multikey object).
  const ecdsaFromMultibase = EcdsaMultikey.from as (input: unknown) => unknown;
  for (const header of ['zDna', 'z82L'] as const) {
    didKeyDriver.use({
      multibaseMultikeyHeader: header,
      fromMultibase: ecdsaFromMultibase
    });
    didWebDriver.use({
      multibaseMultikeyHeader: header,
      fromMultibase: ecdsaFromMultibase
    });
  }
  loader.setDidResolver(resolver);

  const handler = {
    async get(params: Record<string, string>) {
      const url = params.url;
      if (!url.startsWith('http')) {
        throw new Error('NotFoundError');
      }
      try {
        const { body, status } = await httpGetService.get(url);
        if (status < 200 || status >= 300) {
          throw new Error(`HTTP ${status}`);
        }
        // Return the bare *parsed* document. Two things matter here, and
        // `httpClientHandler` in security-document-loader gets both right:
        //
        // 1. No envelope. `jsonld-document-loader` wraps whatever a protocol
        //    handler returns into `{ contextUrl, document, documentUrl }`
        //    itself, so returning one here nests it — callers that unwrap
        //    `.document` get the inner envelope instead of the document.
        //
        // 2. Parse strings. `BuiltinHttpGetService` only parses when the
        //    response carries a JSON content type, and status lists are
        //    routinely served as `text/plain` (raw.githubusercontent.com
        //    does), so the body arrives as a string. `ContextResolver`
        //    happens to parse strings itself, which is why remote contexts
        //    survive; document loads such as `checkStatus` do not.
        //
        // A body that is a string but not JSON throws inside this try, so it
        // still surfaces as a wrapped `NotFoundError` for the url.
        return typeof body === 'string' ? JSON.parse(body) : body;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`NotFoundError loading "${url}": ${msg}`, { cause: e });
      }
    }
  };
  loader.setProtocolHandler({ protocol: 'http', handler });
  loader.setProtocolHandler({ protocol: 'https', handler });
  return loader.build() as DocumentLoader;
}
