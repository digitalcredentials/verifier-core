import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { registrySuite } from '../../src/suites/registry/index.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { VerificationContext } from '../../src/types/context.js';
import type { EntityIdentityRegistry } from '../../src/types/registry.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { FakeRegistryLookup } from '../factories/services/fake-registry-lookup.js';

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
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#ISSUER_NOT_REGISTERED'
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
