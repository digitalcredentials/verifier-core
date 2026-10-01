import { describe, it, expect } from 'vitest';
import type { EntityIdentityRegistry } from '../../../src/types/registry.js';
import { DEFAULT_TTL_MS } from '../../../src/services/registry-handlers/cache-ttl.js';
import { lookupDccLegacy } from '../../../src/services/registry-handlers/dcc-legacy-handler.js';
import type { RegistryHandlerContext } from '../../../src/services/registry-handlers/types.js';
import { FakeCacheService } from '../../factories/services/fake-cache-service.js';
import {
  FakeHttpGetService,
  httpGetResult,
  okJsonBody
} from '../../factories/services/fake-http-get-service.js';
import { FakeVerifier } from '../../factories/services/fake-verifier.js';

const registryUrl = 'https://example.com/registry.json';

function buildCtx(
  overrides: Partial<RegistryHandlerContext> = {}
): RegistryHandlerContext {
  return {
    httpGetService: overrides.httpGetService ?? FakeHttpGetService({}),
    cacheService: overrides.cacheService ?? FakeCacheService(),
    verifier: overrides.verifier ?? FakeVerifier()
  };
}

const dccRegistry: EntityIdentityRegistry = {
  name: 'Sandbox',
  type: 'dcc-legacy',
  url: registryUrl
};

const sampleBody = {
  meta: { updated: '2026-01-01T00:00:00+00:00' },
  registry: {
    'did:key:found': { name: 'Found Issuer', url: 'https://issuer.example' }
  }
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

describe('lookupDccLegacy', () => {
  it('returns found when DID is in registry', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: okJsonBody(sampleBody)
    });
    const result = await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({ status: 'found', registryName: 'Sandbox' });
  });

  it('returns not-found when DID is absent', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: okJsonBody(sampleBody)
    });
    const result = await lookupDccLegacy(
      'did:key:missing',
      dccRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns unchecked when httpGetService.get throws', async () => {
    const httpGetService = {
      async get() {
        throw new Error('network');
      }
    };
    const result = await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    });
  });

  it('returns unchecked on non-OK response', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: httpGetResult(503, '')
    });
    const result = await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    });
  });

  it('returns unchecked on invalid JSON shape', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: okJsonBody({ notRegistry: true })
    });
    const result = await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Sandbox'
    });
  });

  it('uses cache on second lookup (single httpGet)', async () => {
    let calls = 0;
    const httpGetService = {
      async get(url: string) {
        calls++;
        if (url !== registryUrl) {
          throw new Error(`unexpected ${url}`);
        }
        return okJsonBody(sampleBody);
      }
    };
    const cache = FakeCacheService();
    await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(calls).toBe(1);
  });

  it('passes Cache-Control max-age to cache TTL', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: {
        body: sampleBody,
        headers: new Headers({ 'cache-control': 'max-age=120' }),
        status: 200
      }
    });
    const { cache, sets } = cacheWithSetSpy();
    await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(sets).toHaveLength(1);
    expect(sets[0].key).toBe(`dcc-legacy:${registryUrl}`);
    expect(sets[0].value).toEqual(sampleBody);
    expect(sets[0].ttl).toBe(120_000);
  });

  it('uses default TTL when Cache-Control has no max-age', async () => {
    const httpGetService = FakeHttpGetService({
      [registryUrl]: okJsonBody(sampleBody)
    });
    const { cache, sets } = cacheWithSetSpy();
    await lookupDccLegacy(
      'did:key:found',
      dccRegistry,
      buildCtx({ httpGetService, cacheService: cache })
    );
    expect(sets[0].ttl).toBe(DEFAULT_TTL_MS);
  });

  it('returns unchecked when registry type is not dcc-legacy', async () => {
    const oidf: EntityIdentityRegistry = {
      name: 'OIDF',
      type: 'oidf',
      trustAnchorEC: 'https://ta.example/.well-known/openid-federation'
    };
    let calls = 0;
    const httpGetService = {
      async get() {
        calls++;
        return okJsonBody({});
      }
    };
    const result = await lookupDccLegacy(
      'did:key:x',
      oidf,
      buildCtx({ httpGetService })
    );
    expect(result).toEqual({ status: 'unchecked', registryName: 'OIDF' });
    expect(calls).toBe(0);
  });
});
