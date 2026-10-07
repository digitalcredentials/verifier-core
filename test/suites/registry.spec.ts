import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { registrySuite } from '../../src/suites/registry/index.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { VerificationContext } from '../../src/types/context.js';
import type { EntityIdentityRegistry } from '../../src/types/registry.js';
import {
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID
} from '../factories/data/credential-factory.js';
import { FakeRegistryLookup } from '../factories/services/fake-registry-lookup.js';
import { FakeCryptoService } from '../factories/services/fake-crypto-service.js';
import { FakeHttpGetService } from '../factories/services/fake-http-get-service.js';
import { InMemoryCacheService } from '../../src/services/cache-service/in-memory-cache-service.js';
import { createVerifier } from '../../src/verifier.js';
import { ProblemTypes } from '../../src/problem-types.js';

const testRegistries: EntityIdentityRegistry[] = [
  {
    name: 'Unit Test Registry',
    type: 'dcc-legacy',
    url: 'https://factory.test/registry/legacy.json'
  }
];

describe('Registry Suite', () => {
  const baseContext = buildTestContext();

  const createSubject = (credential: unknown): VerificationSubject => ({
    verifiableCredential: credential
  });

  describe('no registries in context', () => {
    it('skips check when no registries configured', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: undefined
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('registry.issuer');
      expect(results[0].outcome.status).toBe('skipped');
      if (results[0].outcome.status === 'skipped') {
        expect(results[0].outcome.reason).toContain('No registries configured');
      }
    });

    it('skips check when registries is an empty array', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: [],
        lookupIssuers: FakeRegistryLookup({ found: false })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('skipped');
      if (results[0].outcome.status === 'skipped') {
        expect(results[0].outcome.reason).toContain('No registries configured');
      }
    });

    it('reports no ISSUER_NOT_REGISTERED for registries: [], as the recognition handler verifies its credential', async () => {
      const verifier = createVerifier({
        httpGetService: FakeHttpGetService({}),
        cacheService: InMemoryCacheService(),
        cryptoServices: [FakeCryptoService({ verified: true })],
        registries: testRegistries,
        verbose: true
      });
      const result = await verifier.verifyCredential({
        credential: CredentialFactory({ version: 'v2', credential: {} }),
        registries: []
      });

      const registryResult = result.results.find(
        r => r.check === 'registry.issuer'
      );
      expect(registryResult?.outcome.status).toBe('skipped');
      expect(JSON.stringify(result)).not.toContain(
        ProblemTypes.ISSUER_NOT_REGISTERED
      );
    });
  });

  describe('issuer lookup (fake)', () => {
    it('succeeds when issuer found in registry', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: true,
          matchingRegistries: ['Unit Test Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('success');
      if (results[0].outcome.status === 'success') {
        expect(results[0].outcome.message).toContain('Unit Test Registry');
      }
    });

    it('fails when issuer not in registry', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({ found: false })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems).toHaveLength(1);
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#ISSUER_NOT_REGISTERED'
        );
        // Every registry answered, so "any known" is true.
        expect(results[0].outcome.problems[0].detail).toBe(
          `Issuer ${DEFAULT_TEST_ISSUER_DID} was not found in any known DID registry.`
        );
      }
    });

    it('returns REGISTRY_ERROR when lookup throws', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({
          error: new Error('Network failure')
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#REGISTRY_ERROR'
        );
        expect(results[0].outcome.problems[0].detail).toContain(
          'Network failure'
        );
      }
    });

    it('reports only REGISTRY_UNCHECKED when every registry is unchecked', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const twoRegistries: EntityIdentityRegistry[] = [
        ...testRegistries,
        {
          name: 'Second Registry',
          type: 'oidf',
          trustAnchorEC: 'https://ta.test'
        }
      ];
      const context: VerificationContext = {
        ...baseContext,
        registries: twoRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: false,
          uncheckedRegistries: ['Unit Test Registry', 'Second Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems).toHaveLength(1);
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.REGISTRY_UNCHECKED
        );
        expect(results[0].outcome.problems[0].detail).toBe(
          'Issuer registration could not be determined: 2 registries could not be checked: Unit Test Registry, Second Registry'
        );
      }
    });

    it('keeps ISSUER_NOT_REGISTERED plus REGISTRY_UNCHECKED when only some are unchecked', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const twoRegistries: EntityIdentityRegistry[] = [
        ...testRegistries,
        {
          name: 'Second Registry',
          type: 'oidf',
          trustAnchorEC: 'https://ta.test'
        }
      ];
      const context: VerificationContext = {
        ...baseContext,
        registries: twoRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: false,
          uncheckedRegistries: ['Second Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems.map(p => p.type)).toEqual([
          ProblemTypes.ISSUER_NOT_REGISTERED,
          ProblemTypes.REGISTRY_UNCHECKED
        ]);
        // Only the registry that answered establishes "not registered".
        expect(results[0].outcome.problems[0].detail).toBe(
          `Issuer ${DEFAULT_TEST_ISSUER_DID} was not found in the 1 registry that could be checked; 1 could not be checked.`
        );
        expect(results[0].outcome.problems[1].detail).toBe(
          '1 registries could not be checked: Second Registry'
        );
      }
    });

    it('counts the registries that answered when several did', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const threeRegistries: EntityIdentityRegistry[] = [
        ...testRegistries,
        {
          name: 'Second Registry',
          type: 'oidf',
          trustAnchorEC: 'https://ta.test'
        },
        {
          name: 'Third Registry',
          type: 'dcc-legacy',
          url: 'https://factory.test/registry/third.json'
        }
      ];
      const context: VerificationContext = {
        ...baseContext,
        registries: threeRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: false,
          uncheckedRegistries: ['Second Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].detail).toBe(
          `Issuer ${DEFAULT_TEST_ISSUER_DID} was not found in the 2 registries that could be checked; 1 could not be checked.`
        );
      }
    });

    it('reports only REGISTRY_UNCHECKED when a lookup reports more unchecked registries than are configured', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: false,
          uncheckedRegistries: ['Unit Test Registry', 'Phantom Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems.map(p => p.type)).toEqual([
          ProblemTypes.REGISTRY_UNCHECKED
        ]);
        expect(results[0].outcome.problems[0].detail).toMatch(
          /^Issuer registration could not be determined: /
        );
      }
    });

    it('reports unchecked registries when provided', async () => {
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({
          found: true,
          matchingRegistries: ['Unit Test Registry'],
          uncheckedRegistries: ['Other Registry']
        })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results[0].outcome.status).toBe('success');
      if (results[0].outcome.status === 'success') {
        expect(results[0].outcome.message).toContain('could not be checked');
      }
    });
  });

  describe('missing issuer', () => {
    it('fails when credential has no issuer', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      delete (cred as { issuer?: unknown }).issuer;

      const subject = createSubject(cred);
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({ found: true })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe('Issuer Not Found');
      }
    });

    it('handles issuer as string', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          issuer: 'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q'
        }
      });

      const subject = createSubject(cred);
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({ found: true })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('registry.issuer');
      expect(results[0].outcome.status).toBe('success');
    });
  });

  describe('no subject', () => {
    it('is skipped via appliesTo filter when no credential provided', async () => {
      const subject: VerificationSubject = {};
      const context: VerificationContext = {
        ...baseContext,
        registries: testRegistries,
        lookupIssuers: FakeRegistryLookup({ found: true })
      };
      const results = await runSuites([registrySuite], subject, context);

      expect(results).toHaveLength(0);
    });
  });
});
