import { describe, it, expect } from 'vitest';
import type { EntityIdentityRegistry } from '../../../src/types/registry.js';
import type { HttpGetService } from '../../../src/services/http-get-service/http-get-service.js';
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
const fetchEndpoint = 'https://op.example/federation-fetch';

const makeJwt = (payload: object): string => {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  return `e.${b64}.s`;
};

const entityPayload = {
  metadata: {
    federation_entity: {
      name: 'Trust Anchor',
      federation_fetch_endpoint: fetchEndpoint
    }
  }
};

const issuerPayload = {
  metadata: { sub: 'did:key:abc', organization_name: 'Issuer' }
};

const oidfRegistry: EntityIdentityRegistry = {
  name: 'OIDF Test',
  type: 'oidf',
  trustAnchorEC: ecUrl
};

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
  it('caches entity config JWT (single EC fetch across two lookups)', async () => {
    const issuerJwt = makeJwt(issuerPayload);
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    let ecCalls = 0;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          ecCalls++;
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return {
            body: issuerJwt,
            headers: new Headers({ 'cache-control': 'max-age=30' }),
            status: 200
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const cache = FakeCacheService();
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(ecCalls).toBe(1);
  });

  it('returns found when federation fetch returns 200', async () => {
    const issuerJwt = makeJwt(issuerPayload);
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return { body: issuerJwt, headers: new Headers(), status: 200 };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const result = await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({ status: 'found', registryName: 'OIDF Test' });
  });

  it('returns not-found on 404 and does not cache lookup', async () => {
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:missing')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return httpGetResult(404, '', new Headers());
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const cache = FakeCacheService();
    const result = await lookupOidf(
      'did:key:missing',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(result).toEqual({ status: 'not-found' });
    expect(await cache.get(`oidf:lookup:${lookupUrl}`)).toBeUndefined();
  });

  it('returns unchecked on federation non-404 error', async () => {
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:x')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return httpGetResult(503, '');
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const result = await lookupOidf(
      'did:key:x',
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'OIDF Test'
    });
  });

  it('returns unchecked when EC fetch throws', async () => {
    const httpGetService: HttpGetService = {
      async get() {
        throw new Error('down');
      }
    };
    const result = await lookupOidf(
      'did:key:x',
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'OIDF Test'
    });
  });

  it('respects Cache-Control max-age on DID lookup cache set', async () => {
    const issuerJwt = makeJwt(issuerPayload);
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return {
            body: issuerJwt,
            headers: new Headers({ 'cache-control': 'max-age=45' }),
            status: 200
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const { cache, sets } = cacheWithSetSpy();
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    const lookupSet = sets.find(
      s => typeof s.key === 'string' && s.key.startsWith('oidf:lookup:')
    );
    expect(lookupSet?.ttl).toBe(45_000);
  });

  it('caches DID lookup result and skips second federation fetch', async () => {
    const issuerJwt = makeJwt(issuerPayload);
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    let lookupCalls = 0;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          lookupCalls++;
          return { body: issuerJwt, headers: new Headers(), status: 200 };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const cache = FakeCacheService();
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(lookupCalls).toBe(1);
  });

  it('uses default TTL for entity config when no Cache-Control', async () => {
    const issuerJwt = makeJwt(issuerPayload);
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return { body: issuerJwt, headers: new Headers(), status: 200 };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const { cache, sets } = cacheWithSetSpy();
    await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    const ecSet = sets.find(
      s => typeof s.key === 'string' && s.key.startsWith('oidf:ec:')
    );
    expect(ecSet?.ttl).toBe(DEFAULT_TTL_MS);
  });

  it('returns unchecked when registry type is not oidf', async () => {
    const dcc: EntityIdentityRegistry = {
      name: 'Legacy',
      type: 'dcc-legacy',
      url: 'https://example.com/r.json'
    };
    let calls = 0;
    const httpGetService: HttpGetService = {
      async get() {
        calls++;
        return okJsonBody({});
      }
    };
    const result = await lookupOidf(
      'did:key:x',
      dcc,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Legacy'
    });
    expect(calls).toBe(0);
  });

  it('rejects issuer JWT without metadata', async () => {
    const badIssuerJwt = makeJwt({ foo: 1 });
    const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent('did:key:abc')}`;
    const httpGetService: HttpGetService = {
      async get(url: string) {
        if (url === ecUrl) {
          return okJsonBody(makeJwt(entityPayload));
        }
        if (url === lookupUrl) {
          return { body: badIssuerJwt, headers: new Headers(), status: 200 };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    };
    const result = await lookupOidf(
      'did:key:abc',
      oidfRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'OIDF Test'
    });
  });
});
