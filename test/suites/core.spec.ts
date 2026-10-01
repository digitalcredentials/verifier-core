import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { coreSuite } from '../../src/suites/core/index.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';

describe('Core Structure Suite', () => {
  const context = buildTestContext();

  const createSubject = (credential: unknown): VerificationSubject => ({
    verifiableCredential: credential
  });

  describe('valid credentials', () => {
    it('passes all checks for valid v2 credential', async () => {
      const subject = createSubject(CredentialFactory({ version: 'v2' }));
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.outcome.status === 'success')).toBe(true);

      const checkIds = results.map(r => r.check);
      expect(checkIds).toEqual([
        'core.context-exists',
        'core.vc-context',
        'core.credential-id',
        'core.proof-exists'
      ]);
    });

    it('passes all checks for valid v1 credential', async () => {
      const subject = createSubject(CredentialFactory({ version: 'v1' }));
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.outcome.status === 'success')).toBe(true);
    });

    it('passes when credential has no ID (optional field)', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { id: undefined }
      });
      delete (cred as { id?: string }).id;
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      const idCheck = results.find(r => r.check === 'core.credential-id');
      expect(idCheck?.outcome.status).toBe('success');
      if (idCheck?.outcome.status === 'success') {
        expect(idCheck.outcome.message).toContain('no ID');
      }
    });
  });

  describe('missing @context', () => {
    it('fails context check and skips remaining checks (fatal)', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      delete (cred as { '@context'?: unknown })['@context'];
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PARSING_ERROR'
        );
      }
    });
  });

  describe('empty @context', () => {
    it('fails context check with empty array', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': [] }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe('Invalid JSON-LD');
      }
    });

    it('fails context check with empty string', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': '' }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('failure');
    });
  });

  describe('invalid @context shapes', () => {
    it('fails when @context is a number', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': 42 as unknown as string }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
    });

    it('fails when @context is a non-empty array of non-strings', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': [{}] as unknown as string[] }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('success');
      expect(results[1].check).toBe('core.vc-context');
      expect(results[1].outcome.status).toBe('failure');
    });
  });

  describe('credential subject missing on check input', () => {
    it('fails context check when verifiableCredential is null', async () => {
      const subject: VerificationSubject = { verifiableCredential: null };
      const results = await runSuites([coreSuite], subject, context);

      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].detail).toContain(
          'No verifiable credential'
        );
      }
    });
  });

  describe('no VC context URI', () => {
    it('fails vc-context check when no valid VC context', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': ['https://example.com/custom-context'] }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('success');
      expect(results[1].check).toBe('core.vc-context');
      expect(results[1].outcome.status).toBe('failure');
      if (results[1].outcome.status === 'failure') {
        expect(results[1].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PARSING_ERROR'
        );
      }
    });
  });

  describe('invalid credential ID', () => {
    it('fails credential-id check for non-URL ID', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { id: 'not-a-valid-url' }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(3);
      expect(results[2].check).toBe('core.credential-id');
      expect(results[2].outcome.status).toBe('failure');
      if (results[2].outcome.status === 'failure') {
        expect(results[2].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#INVALID_CREDENTIAL_ID'
        );
      }
    });

    it('fails credential-id check for non-string ID', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { id: 12345 as unknown as string }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(3);
      expect(results[2].check).toBe('core.credential-id');
      expect(results[2].outcome.status).toBe('failure');
    });

    it('fails credential-id check when id is explicitly null', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { id: null as unknown as string }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      const idCheck = results.find(r => r.check === 'core.credential-id');
      expect(idCheck?.outcome.status).toBe('success');
    });
  });

  describe('missing proof', () => {
    it('fails proof-exists check', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      delete (cred as { proof?: unknown }).proof;
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(4);
      expect(results[3].check).toBe('core.proof-exists');
      expect(results[3].outcome.status).toBe('failure');
      if (results[3].outcome.status === 'failure') {
        expect(results[3].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PROOF_VERIFICATION_ERROR'
        );
      }
    });

    it('fails proof-exists check for null proof', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: null as unknown as object }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[3].check).toBe('core.proof-exists');
      expect(results[3].outcome.status).toBe('failure');
    });

    it('fails proof-exists check for empty proof array', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: [] }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[3].check).toBe('core.proof-exists');
      expect(results[3].outcome.status).toBe('failure');
    });

    it('fails proof-exists when proof array contains null', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: [null] as unknown as object }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[3].check).toBe('core.proof-exists');
      expect(results[3].outcome.status).toBe('failure');
    });
  });

  describe('VC context variations', () => {
    it('accepts v1 context URI', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://example.com/extension'
          ]
        }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[1].check).toBe('core.vc-context');
      expect(results[1].outcome.status).toBe('success');
    });

    it('accepts v2 context URI', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://example.com/extension'
          ]
        }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[1].check).toBe('core.vc-context');
      expect(results[1].outcome.status).toBe('success');
    });

    it('accepts single string context', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': 'https://www.w3.org/ns/credentials/v2' }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[0].outcome.status).toBe('success');
      expect(results[1].outcome.status).toBe('success');
    });
  });
});
