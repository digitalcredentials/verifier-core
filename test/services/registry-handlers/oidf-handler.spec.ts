import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import type { EntityIdentityRegistry } from '../../../src/types/registry.js';
import type { HttpGetResult } from '../../../src/types/http.js';
import { DEFAULT_TTL_MS } from '../../../src/services/registry-handlers/cache-ttl.js';
import { lookupOidf } from '../../../src/services/registry-handlers/oidf-handler.js';
import type { RegistryHandlerContext } from '../../../src/services/registry-handlers/types.js';
import { FakeCacheService } from '../../factories/services/fake-cache-service.js';
import {
  FakeHttpGetService,
  httpGetResult,
  okJsonBody
} from '../../factories/services/fake-http-get-service.js';
import { FakeVerifier } from '../../factories/services/fake-verifier.js';
import {
  entityConfigurationPayload,
  epochSeconds,
  generateSigningKey,
  jwkSet,
  signJws,
  subordinateStatementPayload,
  type TestSigningKey
} from '../../factories/oidf/sign-entity-statement.js';

function buildCtx(
  overrides: Partial<RegistryHandlerContext> = {}
): RegistryHandlerContext {
  return {
    httpGetService: overrides.httpGetService ?? FakeHttpGetService({}),
    cacheService: overrides.cacheService ?? FakeCacheService(),
    verifier: overrides.verifier ?? FakeVerifier()
  };
}

const ecUrl = 'https://ta.example/.well-known/openid-federation';
const entityId = 'https://ta.example';
const fetchEndpoint = 'https://op.example/federation-fetch';
const did = 'did:key:abc';

function lookupUrlFor(sub: string, endpoint = fetchEndpoint): string {
  const url = new URL(endpoint);
  url.searchParams.set('sub', sub);
  return url.href;
}

const lookupUrl = lookupUrlFor(did);

const oidfRegistry: EntityIdentityRegistry = {
  name: 'OIDF Test',
  type: 'oidf',
  trustAnchorEC: ecUrl
};

/** The entity the default subordinate statement's metadata describes. */
const foundEntity = {
  name: 'Issuer',
  raw: { federation_entity: { organization_name: 'Issuer' } }
};
const found = {
  status: 'found',
  registryName: 'OIDF Test',
  entity: foundEntity
};
const unchecked = { status: 'unchecked', registryName: 'OIDF Test' };

/** A 200 serving a JWT, as `BuiltinHttpGetService` returns entity statements. */
const jwtResult = (jwt: string, headers = new Headers()): HttpGetResult =>
  httpGetResult(200, jwt, headers);

function cacheWithSetSpy() {
  const base = FakeCacheService();
  const sets: Array<{ key: string; value: unknown; ttl?: number }> = [];
  return {
    cache: {
      get: base.get.bind(base),
      set: async (key: string, value: unknown, ttl?: number) => {
        sets.push({ key, value, ttl });
        return base.set(key, value, ttl);
      }
    },
    sets
  };
}

describe('lookupOidf', () => {
  let anchorKey: TestSigningKey;
  let otherKey: TestSigningKey;

  beforeAll(async () => {
    anchorKey = await generateSigningKey('ES256', 'anchor-key');
    otherKey = await generateSigningKey('ES256', 'other-key');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The trust anchor's entity configuration, signed by its own key. */
  function entityConfigurationJwt({
    payload = {},
    key = anchorKey,
    header
  }: {
    payload?: Record<string, unknown>;
    key?: TestSigningKey;
    header?: Record<string, unknown>;
  } = {}): Promise<string> {
    return signJws({
      key,
      header,
      payload: {
        ...entityConfigurationPayload({
          entityId,
          jwks: jwkSet(anchorKey),
          fetchEndpoint
        }),
        ...payload
      }
    });
  }

  /** A subordinate statement about `did`, signed by the anchor's key. */
  function subordinateJwt({
    payload = {},
    key = anchorKey
  }: {
    payload?: Record<string, unknown>;
    key?: TestSigningKey;
  } = {}): Promise<string> {
    return signJws({
      key,
      payload: { ...subordinateStatementPayload({ entityId, did }), ...payload }
    });
  }

  async function registryServing(
    subordinate: HttpGetResult,
    entityConfiguration?: HttpGetResult
  ) {
    return FakeHttpGetService({
      [ecUrl]: entityConfiguration ?? jwtResult(await entityConfigurationJwt()),
      [lookupUrl]: subordinate
    });
  }

  it('caches entity config JWT (single EC fetch across two lookups)', async () => {
    const httpGetService = await registryServing(
      jwtResult(
        await subordinateJwt(),
        new Headers({ 'cache-control': 'max-age=30' })
      )
    );
    const cache = FakeCacheService();
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(httpGetService.callsTo(ecUrl)).toBe(1);
  });

  it('returns found when federation fetch returns a verified statement', async () => {
    const httpGetService = await registryServing(
      jwtResult(await subordinateJwt())
    );
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(found);
  });

  describe('entity from the subordinate statement', () => {
    // A `data:` logo, as a live registry may sign, truncated for the test.
    const metadata = {
      federation_entity: {
        organization_name: 'Example University',
        homepage_uri: 'https://example.edu',
        logo_uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      }
    };
    const expectedEntity = {
      name: 'Example University',
      url: 'https://example.edu',
      logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      raw: metadata
    };

    it('carries the verified metadata as the match entity', async () => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ payload: { metadata } }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual({
        status: 'found',
        registryName: 'OIDF Test',
        entity: expectedEntity
      });
    });

    it('carries the same entity on a cache hit', async () => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ payload: { metadata } }))
      );
      const cache = FakeCacheService();
      const ctx = buildCtx({ httpGetService, cacheService: cache });
      const first = await lookupOidf(did, oidfRegistry, ctx);
      const second = await lookupOidf(did, oidfRegistry, ctx);
      expect(second).toEqual(first);
      expect(second).toMatchObject({ entity: expectedEntity });
      expect(httpGetService.callsTo(lookupUrl)).toBe(1);
    });

    it('carries no entity when the statement does not verify', async () => {
      const httpGetService = await registryServing(
        jwtResult(
          await subordinateJwt({ payload: { metadata }, key: otherKey })
        )
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
      expect(result).not.toHaveProperty('entity');
    });

    it('names only the members the statement gives as strings', async () => {
      const sparse = { federation_entity: { homepage_uri: 42 } };
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ payload: { metadata: sparse } }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual({
        status: 'found',
        registryName: 'OIDF Test',
        entity: { raw: sparse }
      });
    });
  });

  it('returns not-found on 404 and does not cache lookup', async () => {
    const httpGetService = await registryServing(
      httpGetResult(404, '', new Headers())
    );
    const cache = FakeCacheService();
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(result).toEqual({ status: 'not-found' });
    expect(await cache.get(`oidf:lookup:${lookupUrl}`)).toBeUndefined();
  });

  it('returns unchecked on federation non-404 error', async () => {
    const httpGetService = await registryServing(httpGetResult(503, ''));
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(unchecked);
  });

  it('returns unchecked when EC fetch throws', async () => {
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService: FakeHttpGetService({}) })
    );
    expect(result).toEqual(unchecked);
  });

  it('respects Cache-Control max-age on DID lookup cache set', async () => {
    const httpGetService = await registryServing(
      jwtResult(
        await subordinateJwt(),
        new Headers({ 'cache-control': 'max-age=45' })
      )
    );
    const { cache, sets } = cacheWithSetSpy();
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    const lookupSet = sets.find(s => s.key.startsWith('oidf:lookup:'));
    expect(lookupSet?.ttl).toBe(45_000);
  });

  it('caches DID lookup result and skips second federation fetch', async () => {
    const httpGetService = await registryServing(
      jwtResult(await subordinateJwt())
    );
    const cache = FakeCacheService();
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    const second = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(second).toEqual(found);
    expect(httpGetService.callsTo(lookupUrl)).toBe(1);
  });

  it('uses default TTL for entity config when no Cache-Control', async () => {
    const httpGetService = await registryServing(
      jwtResult(await subordinateJwt())
    );
    const { cache, sets } = cacheWithSetSpy();
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    // The statement expires in a day, so the one-hour default is the minimum.
    const ecSet = sets.find(s => s.key.startsWith('oidf:ec:'));
    expect(ecSet?.ttl).toBe(DEFAULT_TTL_MS);
  });

  it('returns unchecked when registry type is not oidf', async () => {
    const dcc: EntityIdentityRegistry = {
      name: 'Legacy',
      type: 'dcc-legacy',
      url: 'https://example.com/r.json'
    };
    const httpGetService = FakeHttpGetService(
      {},
      { fallback: { get: async () => okJsonBody({}) } }
    );
    const result = await lookupOidf(
      'did:key:x',
      dcc,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Legacy'
    });
    expect(httpGetService.allCalls()).toEqual([]);
  });

  it('rejects a signed subordinate statement without metadata', async () => {
    const httpGetService = await registryServing(
      jwtResult(await subordinateJwt({ payload: { metadata: undefined } }))
    );
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(unchecked);
  });

  describe('forged or invalid statements', () => {
    it('rejects an unsigned subordinate statement', async () => {
      // The pre-fix handler accepted exactly this: any JWT with metadata.
      const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const forged = `${encode({ alg: 'ES256', kid: 'anchor-key' })}.${encode(
        subordinateStatementPayload({ entityId, did })
      )}.c2ln`;
      const cache = FakeCacheService();
      const httpGetService = await registryServing(jwtResult(forged));
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService, cacheService: cache })
      );
      expect(result).toEqual(unchecked);
      expect(await cache.get(`oidf:lookup:${lookupUrl}`)).toBeUndefined();
    });

    it('rejects a subordinate statement signed by another key', async () => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ key: otherKey }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
    });

    it('rejects an entity configuration that does not verify against its own jwks, without calling the fetch endpoint', async () => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt()),
        jwtResult(await entityConfigurationJwt({ key: otherKey }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
      expect(httpGetService.callsTo(lookupUrl)).toBe(0);
    });

    it.each([
      ['has iss !== sub', { iss: 'https://evil.example' }],
      ['has no jwks', { jwks: undefined }],
      ['has expired', { exp: epochSeconds(-60) }],
      ['has no fetch endpoint', { metadata: { federation_entity: {} } }]
    ])('rejects an entity configuration that %s', async (_label, payload) => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt()),
        jwtResult(await entityConfigurationJwt({ payload }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
      expect(httpGetService.callsTo(lookupUrl)).toBe(0);
    });

    it('rejects an entity configuration with an unsupported alg', async () => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt()),
        jwtResult(await entityConfigurationJwt({ header: { alg: 'RS256' } }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
    });

    it.each([
      ['the wrong iss', { iss: 'https://other-anchor.example' }],
      ['the wrong sub', { sub: 'did:key:someone-else' }],
      ['an expired exp', { exp: epochSeconds(-60) }],
      ['an expired digit-string exp', { exp: String(epochSeconds(-60)) }],
      ['a non-numeric string exp', { exp: 'tomorrow' }],
      ['no exp', { exp: undefined }]
    ])('rejects a subordinate statement with %s', async (_label, payload) => {
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ payload }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(unchecked);
    });

    it('accepts exp as a digit string, as OpenSALT signs it', async () => {
      const exp = String(epochSeconds(24 * 60 * 60));
      const httpGetService = await registryServing(
        jwtResult(await subordinateJwt({ payload: { exp } })),
        jwtResult(await entityConfigurationJwt({ payload: { exp } }))
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService })
      );
      expect(result).toEqual(found);
    });

    it('does not trust a forged statement already in the cache', async () => {
      const cache = FakeCacheService();
      await cache.set(
        `oidf:lookup:${lookupUrl}`,
        await subordinateJwt({ key: otherKey })
      );
      const httpGetService = await registryServing(
        httpGetResult(404, '', new Headers())
      );
      const result = await lookupOidf(
        did,
        oidfRegistry,
        buildCtx({ httpGetService, cacheService: cache })
      );
      expect(result).toEqual({ status: 'not-found' });
      expect(httpGetService.callsTo(lookupUrl)).toBe(1);
    });
  });

  it('verifies the Credential Engine shape: EdDSA, did:web entity id, header kid matching no key', async () => {
    const edKey = await generateSigningKey(
      'EdDSA',
      'did:web:apps.example.org#z6Mk-test'
    );
    const edEntityId = 'did:web:apps.example.org';
    const header = { kid: 'sandbox-ta-1' };
    const ec = await signJws({
      key: edKey,
      header,
      payload: entityConfigurationPayload({
        entityId: edEntityId,
        jwks: jwkSet(edKey),
        fetchEndpoint
      })
    });
    const subordinate = await signJws({
      key: edKey,
      header,
      payload: subordinateStatementPayload({ entityId: edEntityId, did })
    });
    const httpGetService = await registryServing(
      jwtResult(subordinate),
      jwtResult(ec)
    );
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(found);
  });

  it('re-verifies a cached subordinate statement and refetches it once expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const urlMap: Record<string, HttpGetResult> = {
      [ecUrl]: jwtResult(await entityConfigurationJwt()),
      [lookupUrl]: jwtResult(
        await subordinateJwt({ payload: { exp: epochSeconds(120) } })
      )
    };
    const httpGetService = FakeHttpGetService(urlMap);
    const cache = FakeCacheService(); // Ignores TTL, so only `exp` can expire it.
    const ctx = buildCtx({ httpGetService, cacheService: cache });

    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    expect(httpGetService.callsTo(lookupUrl)).toBe(1);

    vi.advanceTimersByTime(121_000);
    urlMap[lookupUrl] = jwtResult(
      await subordinateJwt({ payload: { exp: epochSeconds(120) } })
    );
    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    expect(httpGetService.callsTo(lookupUrl)).toBe(2);
  });

  it('never serves a cached statement past its exp', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const httpGetService = await registryServing(
      jwtResult(await subordinateJwt({ payload: { exp: epochSeconds(120) } }))
    );
    const ctx = buildCtx({ httpGetService, cacheService: FakeCacheService() });

    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    vi.advanceTimersByTime(121_000);
    // The registry still serves the now-expired statement.
    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(unchecked);
  });

  it('refetches a cached entity configuration once expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const urlMap: Record<string, HttpGetResult> = {
      [ecUrl]: jwtResult(
        await entityConfigurationJwt({ payload: { exp: epochSeconds(120) } })
      ),
      [lookupUrl]: jwtResult(await subordinateJwt())
    };
    const httpGetService = FakeHttpGetService(urlMap);
    const ctx = buildCtx({ httpGetService, cacheService: FakeCacheService() });

    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    vi.advanceTimersByTime(121_000);
    urlMap[ecUrl] = jwtResult(await entityConfigurationJwt());
    expect(await lookupOidf(did, oidfRegistry, ctx)).toEqual(found);
    expect(httpGetService.callsTo(ecUrl)).toBe(2);
  });

  it('caps cache TTLs at the statement exp when Cache-Control is longer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const longCache = new Headers({ 'cache-control': 'max-age=86400' });
    const httpGetService = await registryServing(
      jwtResult(
        await subordinateJwt({ payload: { exp: epochSeconds(60) } }),
        longCache
      ),
      jwtResult(
        await entityConfigurationJwt({ payload: { exp: epochSeconds(300) } }),
        longCache
      )
    );
    const { cache, sets } = cacheWithSetSpy();
    await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    const ttlFor = (prefix: string) =>
      sets.find(s => s.key.startsWith(prefix))?.ttl;
    // Date is frozen, so the remaining lifetime is exact (less the rounding
    // of exp down to whole seconds).
    const msToSecondBoundary = Date.now() % 1000;
    expect(ttlFor('oidf:lookup:')).toBe(60_000 - msToSecondBoundary);
    expect(ttlFor('oidf:ec:')).toBe(300_000 - msToSecondBoundary);
  });

  it('keeps an existing query on the fetch endpoint and sets sub', async () => {
    const endpointWithQuery = 'https://op.example/fetch?x=1';
    const expectedUrl = lookupUrlFor(did, endpointWithQuery);
    expect(expectedUrl).toBe(
      'https://op.example/fetch?x=1&sub=did%3Akey%3Aabc'
    );
    const httpGetService = FakeHttpGetService({
      [ecUrl]: jwtResult(
        await entityConfigurationJwt({
          payload: {
            metadata: {
              federation_entity: {
                federation_fetch_endpoint: endpointWithQuery
              }
            }
          }
        })
      ),
      [expectedUrl]: jwtResult(await subordinateJwt())
    });
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(found);
    expect(httpGetService.allCalls()).toEqual([ecUrl, expectedUrl]);
  });

  it('returns unchecked when the fetch endpoint is not a URL', async () => {
    const httpGetService = FakeHttpGetService({
      [ecUrl]: jwtResult(
        await entityConfigurationJwt({
          payload: {
            metadata: {
              federation_entity: { federation_fetch_endpoint: 'not a url' }
            }
          }
        })
      )
    });
    const result = await lookupOidf(
      did,
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual(unchecked);
    expect(httpGetService.allCalls()).toEqual([ecUrl]);
  });
});
