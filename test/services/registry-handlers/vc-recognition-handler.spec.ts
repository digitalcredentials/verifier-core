import { describe, it, expect } from 'vitest';
import type { EntityIdentityRegistry } from '../../../src/types/registry.js';
import type { VerifiableCredential } from '../../../src/schemas/credential.js';
import type { Verifier } from '../../../src/types/verifier.js';
import type { CredentialVerificationResult } from '../../../src/types/result.js';
import type { RegistryHandlerContext } from '../../../src/services/registry-handlers/types.js';
import { lookupVcRecognition } from '../../../src/services/registry-handlers/vc-recognition-handler.js';
import { FakeCacheService } from '../../factories/services/fake-cache-service.js';
import {
  FakeHttpGetService,
  okJsonBody
} from '../../factories/services/fake-http-get-service.js';
import { FakeVerifier } from '../../factories/services/fake-verifier.js';

const listUrl = 'https://example.com/recognition.json';

const buildVc = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'VerifiableRecognitionCredential'],
  issuer: 'did:web:learning-commission.example',
  validFrom: '2025-01-01T00:00:00Z',
  validUntil: '2030-01-01T00:00:00Z',
  credentialSubject: [
    {
      id: 'did:web:university.example',
      type: 'RecognizedEntity',
      name: 'Example Tech'
    }
  ],
  ...overrides
});

const registry: EntityIdentityRegistry = {
  name: 'Recognition List',
  type: 'vc-recognition',
  url: listUrl,
  acceptedIssuers: ['did:web:learning-commission.example']
};

function buildCtx(
  overrides: Partial<RegistryHandlerContext> = {}
): RegistryHandlerContext {
  return {
    httpGetService: overrides.httpGetService ?? FakeHttpGetService({}),
    cacheService: overrides.cacheService ?? FakeCacheService(),
    verifier: overrides.verifier ?? FakeVerifier()
  };
}

describe('lookupVcRecognition', () => {
  it('returns found when DID appears in credentialSubject array', async () => {
    const vc = buildVc();
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) })
    });
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      ctx
    );
    expect(result).toEqual({
      status: 'found',
      registryName: 'Recognition List'
    });
  });

  it('returns found when credentialSubject is a single object', async () => {
    const vc = buildVc({
      credentialSubject: {
        id: 'did:key:single',
        type: 'RecognizedEntity'
      }
    });
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) })
    });
    const result = await lookupVcRecognition('did:key:single', registry, ctx);
    expect(result).toEqual({
      status: 'found',
      registryName: 'Recognition List'
    });
  });

  it('returns not-found when DID is absent', async () => {
    const vc = buildVc();
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) })
    });
    const result = await lookupVcRecognition('did:key:missing', registry, ctx);
    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns unchecked when issuer is not in acceptedIssuers', async () => {
    const vc = buildVc({ issuer: 'did:web:untrusted.example' });
    const verifier: Verifier = FakeVerifier({
      verifyCredential: async () => {
        throw new Error('verifyCredential should not run');
      }
    });
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) }),
      verifier
    });
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      ctx
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    });
  });

  it('matches issuer object id against acceptedIssuers', async () => {
    const vc = buildVc({
      issuer: {
        id: 'did:web:learning-commission.example',
        type: 'RecognizedIssuer'
      }
    });
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) })
    });
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      ctx
    );
    expect(result.status).toBe('found');
  });

  it('returns unchecked when verifyCredential reports not verified', async () => {
    const vc = buildVc();
    const verifier = FakeVerifier({
      verifyCredential: async () =>
        ({
          verified: false,
          verifiableCredential: {} as VerifiableCredential,
          results: [],
          summary: []
        }) satisfies CredentialVerificationResult
    });
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) }),
      verifier
    });
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      ctx
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    });
  });

  it('passes registries: [] to recursive verifyCredential to break recursion', async () => {
    const vc = buildVc();
    let captured: Parameters<Verifier['verifyCredential']>[0] | undefined;
    const verifier = FakeVerifier({
      verifyCredential: async call => {
        captured = call;
        return {
          verified: true,
          verifiableCredential: {} as VerifiableCredential,
          results: [],
          summary: []
        } satisfies CredentialVerificationResult;
      }
    });
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) }),
      verifier
    });
    await lookupVcRecognition('did:web:university.example', registry, ctx);
    expect(captured?.registries).toEqual([]);
  });

  it('calls verifyCredential only once when response is cached', async () => {
    let verifyCalls = 0;
    const verifier = FakeVerifier({
      verifyCredential: async () => {
        verifyCalls++;
        return {
          verified: true,
          verifiableCredential: {} as VerifiableCredential,
          results: [],
          summary: []
        } satisfies CredentialVerificationResult;
      }
    });
    const vc = buildVc();
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) }),
      verifier
    });
    await lookupVcRecognition('did:web:university.example', registry, ctx);
    await lookupVcRecognition('did:web:university.example', registry, ctx);
    expect(verifyCalls).toBe(1);
  });

  it('uses validUntil for cache TTL', async () => {
    const future = new Date(Date.now() + 7200_000).toISOString();
    const vc = buildVc({ validUntil: future });
    const base = FakeCacheService();
    const sets: Array<{ ttl?: number }> = [];
    const cacheService = {
      get: base.get.bind(base),
      set: async (key: string, value: unknown, ttl?: number) => {
        sets.push({ ttl });
        return base.set(key, value, ttl);
      }
    };
    const ctx = buildCtx({
      httpGetService: FakeHttpGetService({ [listUrl]: okJsonBody(vc) }),
      cacheService
    });
    await lookupVcRecognition('did:web:university.example', registry, ctx);
    const ttlArg = sets[0]?.ttl as number;
    expect(ttlArg).toBeGreaterThan(7000_000);
    expect(ttlArg).toBeLessThanOrEqual(7200_000);
  });

  it('returns unchecked on fetch failure', async () => {
    const ctx = buildCtx({
      httpGetService: {
        async get() {
          throw new Error('network');
        }
      }
    });
    const result = await lookupVcRecognition(
      'did:web:university.example',
      registry,
      ctx
    );
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Recognition List'
    });
  });

  it('returns unchecked when registry type is not vc-recognition', async () => {
    const dcc: EntityIdentityRegistry = {
      name: 'Legacy',
      type: 'dcc-legacy',
      url: 'https://example.com/r.json'
    };
    let calls = 0;
    const ctx = buildCtx({
      httpGetService: {
        async get() {
          calls++;
          return okJsonBody({});
        }
      }
    });
    const result = await lookupVcRecognition('did:key:x', dcc, ctx);
    expect(result).toEqual({
      status: 'unchecked',
      registryName: 'Legacy'
    });
    expect(calls).toBe(0);
  });
});
