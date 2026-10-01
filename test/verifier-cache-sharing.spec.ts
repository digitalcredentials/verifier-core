/**
 * Pins the headline performance claim of P-A: a single {@link createVerifier}
 * instance shares its long-lived caches across calls. In particular, an
 * issuer registry lookup that requires an HTTP fetch happens once per
 * registry URL — subsequent verifications for the same issuer hit the
 * verifier's `cacheService` rather than the wire.
 *
 * The proxy for "cache hit" is `FakeHttpGetService`'s built-in call
 * counter: every backing `get(url)` invocation is recorded. Higher-level
 * caches that short-circuit before reaching the HTTP service are observed
 * as a count of zero on the second call.
 *
 * This is intentionally a minimal end-to-end spec — proof and status
 * suites are stubbed/skipped so the only HTTP fetch that should occur
 * is the registry URL.
 */

import { describe, it, expect } from 'vitest';
import { createVerifier } from '../src/verifier.js';
import {
  defaultDocumentLoaderFor,
  defaultHttpGetService
} from '../src/default-services.js';
import { InMemoryCacheService } from '../src/services/cache-service/in-memory-cache-service.js';
import {
  BitstringStatusEntry,
  StatusListCredentialFactory
} from './factories/data/index.js';
import {
  FakeCryptoService,
  FakeHttpGetService,
  okJsonBody
} from './factories/services/index.js';
import type { EntityIdentityRegistry } from '../src/types/registry.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';

const ISSUER_DID = 'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q';
const REGISTRY_URL = 'https://example.test/registry.json';

const REGISTRY_BODY = {
  registry: {
    [ISSUER_DID]: {
      name: 'Example Test Issuer',
      url: 'https://issuer.example.test/'
    }
  }
};

const dccLegacyRegistry: EntityIdentityRegistry = {
  type: 'dcc-legacy',
  name: 'Example DCC Legacy Registry',
  url: REGISTRY_URL
};

/** Build a minimal V2 VC with a did:key issuer, no status, no schema, no result entries. */
function makeCredential(id: string): Record<string, unknown> {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    id,
    type: ['VerifiableCredential'],
    issuer: { id: ISSUER_DID, type: ['Profile'], name: 'Example Test Issuer' },
    validFrom: '2020-01-01T00:00:00Z',
    credentialSubject: {
      id: 'did:example:subject',
      name: 'Test Subject'
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: '2025-01-01T00:00:00Z',
      verificationMethod: `${ISSUER_DID}#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q`,
      proofPurpose: 'assertionMethod',
      proofValue:
        'z0000000000000000000000000000000000000000000000000000000000000000'
    }
  };
}

describe('Verifier cache sharing', () => {
  it('fetches the issuer registry exactly once across two verifications on the same Verifier', async () => {
    const http = FakeHttpGetService({
      [REGISTRY_URL]: okJsonBody(REGISTRY_BODY)
    });

    const verifier = createVerifier({
      httpGetService: http,
      cacheService: InMemoryCacheService(),
      cryptoServices: [FakeCryptoService({ verified: true })],
      registries: [dccLegacyRegistry],
      // Verbose so the registry success surfaces in `results[]` for
      // the sanity assertion below; folded mode would hide it.
      verbose: true
    });

    const first = await verifier.verifyCredential({
      credential: makeCredential('urn:uuid:cache-share-1')
    });
    const second = await verifier.verifyCredential({
      credential: makeCredential('urn:uuid:cache-share-2')
    });

    // Sanity: the registry suite ran and found the issuer in both calls.
    const firstRegistry = first.results.find(r => r.suite === 'registry');
    const secondRegistry = second.results.find(r => r.suite === 'registry');
    expect(firstRegistry?.outcome.status).toBe('success');
    expect(secondRegistry?.outcome.status).toBe('success');

    // Headline claim: only one backing fetch to the registry URL.
    expect(http.callsTo(REGISTRY_URL)).toBe(1);
  });

  it('refetches when each call uses its own fresh Verifier (no shared cache)', async () => {
    const http = FakeHttpGetService({
      [REGISTRY_URL]: okJsonBody(REGISTRY_BODY)
    });

    const config = {
      httpGetService: http,
      cacheService: InMemoryCacheService(),
      cryptoServices: [FakeCryptoService({ verified: true })],
      registries: [dccLegacyRegistry]
    };

    // Build a fresh verifier (and therefore a fresh cacheService) per call.
    await createVerifier({
      ...config,
      cacheService: InMemoryCacheService()
    }).verifyCredential({
      credential: makeCredential('urn:uuid:no-share-1')
    });
    await createVerifier({
      ...config,
      cacheService: InMemoryCacheService()
    }).verifyCredential({
      credential: makeCredential('urn:uuid:no-share-2')
    });

    // Confirms the previous test's "==1" is meaningful: without a shared
    // cache, the registry URL is hit per call.
    expect(http.callsTo(REGISTRY_URL)).toBe(2);
  });

  describe('status list URL routing through httpGetService (P-E)', () => {
    const STATUS_LIST_URL = 'https://example.test/status/list-pe';

    /** Same-shape VC as `makeCredential`, but adds a BitstringStatusListEntry. */
    function makeRevocableCredential(id: string): Record<string, unknown> {
      return {
        ...makeCredential(id),
        credentialStatus: BitstringStatusEntry({
          statusListCredential: STATUS_LIST_URL,
          statusListIndex: '0'
        })
      };
    }

    it('fetches the status list URL exactly once per verifyCredential call (no double-check from the proof suite)', async () => {
      const slCred = await StatusListCredentialFactory({
        id: STATUS_LIST_URL,
        revokedIndexes: [],
        listLength: 32
      });
      const http = FakeHttpGetService({
        [REGISTRY_URL]: okJsonBody(REGISTRY_BODY),
        [STATUS_LIST_URL]: okJsonBody(slCred)
      });

      const verifier = createVerifier({
        httpGetService: http,
        cacheService: InMemoryCacheService(),
        cryptoServices: [FakeCryptoService({ verified: true })],
        registries: [dccLegacyRegistry]
      });

      await verifier.verifyCredential({
        credential: makeRevocableCredential('urn:uuid:status-once-1')
      });

      // Pre-P-E this was 2 (DataIntegrityCryptoService.checkStatus + statusSuite).
      // Post-P-E only statusSuite fetches the list.
      expect(http.callsTo(STATUS_LIST_URL)).toBe(1);
    });
  });

  describe('document loader memoization per HttpGetService (P-E)', () => {
    it('returns the same DocumentLoader for the same HttpGetService instance', () => {
      const fake: HttpGetService = FakeHttpGetService({});
      const a = defaultDocumentLoaderFor(fake);
      const b = defaultDocumentLoaderFor(fake);
      expect(a).toBe(b);
    });

    it('returns the same DocumentLoader for the memoized default HttpGetService across calls', () => {
      const a = defaultDocumentLoaderFor(defaultHttpGetService());
      const b = defaultDocumentLoaderFor(defaultHttpGetService());
      expect(a).toBe(b);
    });

    it('returns a different DocumentLoader for a different HttpGetService instance', () => {
      const a = defaultDocumentLoaderFor(FakeHttpGetService({}));
      const b = defaultDocumentLoaderFor(FakeHttpGetService({}));
      expect(a).not.toBe(b);
    });
  });

  it('shares the cache across the credentials embedded in a presentation', async () => {
    const http = FakeHttpGetService({
      [REGISTRY_URL]: okJsonBody(REGISTRY_BODY)
    });

    const verifier = createVerifier({
      httpGetService: http,
      cacheService: InMemoryCacheService(),
      cryptoServices: [FakeCryptoService({ verified: true })],
      registries: [dccLegacyRegistry]
    });

    const presentation = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiablePresentation'],
      verifiableCredential: [
        makeCredential('urn:uuid:vp-cred-1'),
        makeCredential('urn:uuid:vp-cred-2')
      ]
    };

    await verifier.verifyPresentation({
      presentation,
      unsignedPresentation: true
    });

    // verifyPresentation recurses into verifier.verifyCredential for each
    // embedded VC; both share the verifier's cacheService.
    expect(http.callsTo(REGISTRY_URL)).toBe(1);
  });
});
