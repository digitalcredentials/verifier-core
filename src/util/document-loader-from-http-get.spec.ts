import { describe, it, expect } from 'vitest';
import { documentLoaderFromHttpGet } from './document-loader-from-http-get.js';
import type { HttpGetService } from '../services/http-get-service/http-get-service.js';

/**
 * A status list credential is the realistic case. Static contexts cover most
 * URLs a verification resolves, so an arbitrary remote document like this one
 * is close to the only thing that reaches the http protocol handler — which is
 * why a bug here shows up as "revocation is broken" and nothing else.
 */
const STATUS_LIST_URL = 'https://example.edu/status/1';
const STATUS_LIST = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: STATUS_LIST_URL,
  type: ['VerifiableCredential', 'BitstringStatusListCredential'],
  credentialSubject: {
    id: `${STATUS_LIST_URL}#list`,
    type: 'BitstringStatusList',
    statusPurpose: 'revocation',
    encodedList: 'uH4sIAAAAAAAAA-3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AYbSVKsAQAAA'
  }
};

/**
 * `BuiltinHttpGetService` parses the body only when the response carries a
 * JSON content type, and returns raw text otherwise. Both are reproduced here
 * because the two cases fail for different reasons.
 */
const jsonService: HttpGetService = {
  get: async () => ({
    body: STATUS_LIST,
    headers: new Headers({ 'content-type': 'application/json' }),
    status: 200
  })
};

/** How a status list actually arrives from raw.githubusercontent.com. */
const textService: HttpGetService = {
  get: async () => ({
    body: JSON.stringify(STATUS_LIST),
    headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
    status: 200
  })
};

describe('documentLoaderFromHttpGet', () => {
  it('resolves a JSON-typed body to the document, not a nested envelope', async () => {
    const loader = documentLoaderFromHttpGet(jsonService);

    const result = await loader(STATUS_LIST_URL);

    // `jsonld-document-loader` builds the `{ contextUrl, document,
    // documentUrl }` envelope around whatever the protocol handler returns.
    // A handler that returns an envelope of its own gets it nested, and every
    // caller that unwraps `.document` — `checkStatus` among them — receives
    // the inner envelope rather than the credential.
    expect(result.document).toEqual(STATUS_LIST);
    expect(result.document).not.toHaveProperty('document');
  });

  it('parses a text/plain body rather than passing the string through', async () => {
    const loader = documentLoaderFromHttpGet(textService);

    const result = await loader(STATUS_LIST_URL);

    // The case that breaks real verifications. `ContextResolver` parses
    // strings itself, so remote JSON-LD contexts survive a string body and
    // only document loads fail — which is why this hid behind "status lists
    // are broken" rather than "the loader is broken".
    expect(typeof result.document).toBe('object');
    expect(result.document).toEqual(STATUS_LIST);
  });

  it('exposes the fields a status list consumer destructures', async () => {
    for (const service of [jsonService, textService]) {
      const loader = documentLoaderFromHttpGet(service);

      const { document } = (await loader(STATUS_LIST_URL)) as {
        document: typeof STATUS_LIST;
      };

      // The shape `vc-bitstring-status-list` reaches for. Reading it off a
      // nested envelope, or off a string, throws "Cannot destructure property
      // 'statusPurpose' of 'slCredential.credentialSubject' as it is
      // undefined".
      expect(document.credentialSubject.statusPurpose).toBe('revocation');
    }
  });

  it('reports an unparseable body as a NotFoundError naming the url', async () => {
    const brokenService: HttpGetService = {
      get: async () => ({
        body: '<!DOCTYPE html><title>404</title>',
        headers: new Headers({ 'content-type': 'text/html' }),
        status: 200
      })
    };
    const loader = documentLoaderFromHttpGet(brokenService);

    // A 200 carrying an error page is common enough to be worth pinning: it
    // has to surface as this loader failing to find the document, with the
    // url in the message, rather than as a destructuring error further down.
    await expect(loader(STATUS_LIST_URL)).rejects.toThrow(STATUS_LIST_URL);
  });
});
