import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { coreSuite } from '../../src/suites/core/index.js';
import { proofExistsCheck } from '../../src/suites/core/proof-exists-check.js';
import { vcStructureCheck } from '../../src/suites/core/vc-structure-check.js';
import { vpStructureCheck } from '../../src/suites/core/vp-structure-check.js';
import { ProblemTypes } from '../../src/problem-types.js';
import type { CheckOutcome, CheckResult } from '../../src/types/check.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import {
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID
} from '../factories/data/credential-factory.js';
import { PresentationFactory } from '../factories/data/presentation-factory.js';

describe('Core Structure Suite', () => {
  const context = buildTestContext();

  const createSubject = (credential: unknown): VerificationSubject => ({
    verifiableCredential: credential
  });

  /** Every row after a fatal failure is a "Not run" skip naming it. */
  const expectNotRunAfter = (rows: CheckResult[], haltedBy: string) => {
    for (const row of rows) {
      expect(row.outcome).toEqual({
        status: 'skipped',
        reason: `Not run: ${haltedBy} failed`
      });
    }
  };

  describe('valid credentials', () => {
    it('passes all checks for valid v2 credential', async () => {
      const subject = createSubject(CredentialFactory({ version: 'v2' }));
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.outcome.status === 'success')).toBe(true);

      const checkIds = results.map(r => r.check);
      expect(checkIds).toEqual([
        'core.context-exists',
        'core.vc-context',
        'core.vc-structure',
        'core.credential-id',
        'core.proof-exists'
      ]);
    });

    it('passes all checks for valid v1 credential', async () => {
      const subject = createSubject(CredentialFactory({ version: 'v1' }));
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(5);
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

      expect(results).toHaveLength(5);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PARSING_ERROR'
        );
      }
      expectNotRunAfter(results.slice(1), 'core.context-exists');
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

      expect(results).toHaveLength(5);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe('Invalid JSON-LD');
      }
      expectNotRunAfter(results.slice(1), 'core.context-exists');
    });

    it('fails context check with empty string', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': '' }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(5);
      expect(results[0].outcome.status).toBe('failure');
      expectNotRunAfter(results.slice(1), 'core.context-exists');
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

      expect(results).toHaveLength(5);
      expect(results[0].check).toBe('core.context-exists');
      expect(results[0].outcome.status).toBe('success');
      expect(results[1].check).toBe('core.vc-context');
      expect(results[1].outcome.status).toBe('failure');
      if (results[1].outcome.status === 'failure') {
        expect(results[1].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PARSING_ERROR'
        );
      }
      expectNotRunAfter(results.slice(2), 'core.vc-context');
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

      expect(results).toHaveLength(5);
      expect(results[3].check).toBe('core.credential-id');
      expect(results[3].outcome.status).toBe('failure');
      if (results[3].outcome.status === 'failure') {
        expect(results[3].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#INVALID_CREDENTIAL_ID'
        );
      }
      expectNotRunAfter(results.slice(4), 'core.credential-id');
    });

    it('fails credential-id check for non-string ID', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { id: 12345 as unknown as string }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results).toHaveLength(5);
      expect(results[3].check).toBe('core.credential-id');
      expect(results[3].outcome.status).toBe('failure');
      expectNotRunAfter(results.slice(4), 'core.credential-id');
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

      expect(results).toHaveLength(5);
      expect(results[4].check).toBe('core.proof-exists');
      expect(results[4].outcome.status).toBe('failure');
      if (results[4].outcome.status === 'failure') {
        expect(results[4].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PROOF_VERIFICATION_ERROR'
        );
      }
    });

    it('fails proof-exists check for null proof', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: null as unknown as object }
      });
      // core.vc-structure rejects a null proof before this check runs in
      // the suite, so exercise the check directly.
      const outcome = await proofExistsCheck.execute(
        createSubject(cred),
        context
      );

      expect(outcome.status).toBe('failure');
    });

    it('fails proof-exists check for empty proof array', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: [] }
      });
      const subject = createSubject(cred);
      const results = await runSuites([coreSuite], subject, context);

      expect(results[4].check).toBe('core.proof-exists');
      expect(results[4].outcome.status).toBe('failure');
    });

    it('fails proof-exists when proof array contains null', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { proof: [null] as unknown as object }
      });
      // core.vc-structure rejects a null proof entry before this check
      // runs in the suite, so exercise the check directly.
      const outcome = await proofExistsCheck.execute(
        createSubject(cred),
        context
      );

      expect(outcome.status).toBe('failure');
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

describe('vc-structure', () => {
  const context = buildTestContext();

  const run = (credential: unknown) =>
    vcStructureCheck.execute({ verifiableCredential: credential }, context);

  /** The `instance` pointers of a failure, in report order. */
  const pointers = (outcome: CheckOutcome): Array<string | undefined> => {
    expect(outcome.status).toBe('failure');
    return outcome.status === 'failure'
      ? outcome.problems.map(p => p.instance)
      : [];
  };

  const v2 = (credential: Record<string, unknown> = {}) =>
    CredentialFactory({ version: 'v2', credential });
  const v1 = (credential: Record<string, unknown> = {}) =>
    CredentialFactory({ version: 'v1', credential });

  it('is fatal and applies only to credentials', () => {
    expect(vcStructureCheck.id).toBe('core.vc-structure');
    expect(vcStructureCheck.fatal).toBe(true);
    expect(vcStructureCheck.appliesTo).toEqual(['verifiableCredential']);
  });

  describe('valid credentials', () => {
    it('passes a v2 factory credential', async () => {
      const outcome = await run(v2());
      expect(outcome).toEqual({
        status: 'success',
        message: 'Credential structure conforms to the VC Data Model.'
      });
    });

    it('passes a v1 factory credential', async () => {
      expect((await run(v1())).status).toBe('success');
    });

    it('passes a single-string type and a single-string @context', async () => {
      const outcome = await run(
        v2({
          '@context': 'https://www.w3.org/ns/credentials/v2',
          type: 'VerifiableCredential'
        })
      );
      expect(outcome.status).toBe('success');
    });
  });

  describe('subject without a credential', () => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', 'not a credential'],
      ['an array', []]
    ])('fails when the credential is %s', async (_label, value) => {
      const outcome = await run(value);
      expect(outcome.status).toBe('failure');
      if (outcome.status === 'failure') {
        expect(outcome.problems).toHaveLength(1);
        expect(outcome.problems[0].detail).toContain(
          'No verifiable credential'
        );
      }
    });
  });

  describe('problem shape', () => {
    it('uses PARSING_ERROR, the structure title and a specific detail', async () => {
      const outcome = await run(
        v2({ credentialStatus: [{ type: 'X' }, { id: 'urn:uuid:1' }] })
      );
      expect(outcome.status).toBe('failure');
      if (outcome.status === 'failure') {
        expect(outcome.problems).toEqual([
          {
            type: ProblemTypes.PARSING_ERROR,
            title: 'Invalid Credential Structure',
            detail: '"credentialStatus[1]" must have a "type".',
            instance: '/credentialStatus/1/type'
          }
        ]);
      }
    });
  });

  describe('type', () => {
    it('fails at /type when type is missing', async () => {
      const cred = v2();
      delete cred.type;
      expect(pointers(await run(cred))).toEqual(['/type']);
    });

    it('fails at /type when type does not include VerifiableCredential', async () => {
      const outcome = await run(v2({ type: ['OpenBadgeCredential'] }));
      expect(pointers(outcome)).toEqual(['/type']);
      if (outcome.status === 'failure') {
        expect(outcome.problems[0].detail).toBe(
          '"type" must include "VerifiableCredential".'
        );
      }
    });
  });

  describe('credentialSubject', () => {
    it('fails at /credentialSubject when missing', async () => {
      const cred = v2();
      delete cred.credentialSubject;
      expect(pointers(await run(cred))).toEqual(['/credentialSubject']);
    });

    it.each([
      ['null', null],
      ['a string', 'did:example:123'],
      ['an empty object', {}]
    ])('fails at /credentialSubject when it is %s', async (_label, value) => {
      // Assigned, not merged: the factory deep-merges object patches.
      const cred = v2();
      cred.credentialSubject = value;
      expect(pointers(await run(cred))).toEqual(['/credentialSubject']);
    });

    it('fails at the index of a bad entry in an array', async () => {
      const outcome = await run(
        v2({ credentialSubject: [{ name: 'Ada' }, [], {}] })
      );
      expect(pointers(outcome)).toEqual([
        '/credentialSubject/1',
        '/credentialSubject/2'
      ]);
    });

    it('fails at /credentialSubject/id when the subject id is not a URL', async () => {
      const outcome = await run(
        v2({ credentialSubject: { id: 'not a url', name: 'Ada' } })
      );
      expect(pointers(outcome)).toEqual(['/credentialSubject/id']);
    });

    it('fails at /credentialSubject/<i>/id in an array', async () => {
      const outcome = await run(
        v2({
          credentialSubject: [
            { id: 'did:example:ok' },
            { id: 'not a url', name: 'Ada' }
          ]
        })
      );
      expect(pointers(outcome)).toEqual(['/credentialSubject/1/id']);
    });

    it('passes a subject with no id', async () => {
      const cred = v2();
      cred.credentialSubject = { name: 'Ada' };
      expect((await run(cred)).status).toBe('success');
    });
  });

  describe('issuer', () => {
    it('fails at /issuer when missing', async () => {
      const cred = v2();
      delete cred.issuer;
      expect(pointers(await run(cred))).toEqual(['/issuer']);
    });

    it('passes a URL string issuer', async () => {
      expect((await run(v2({ issuer: 'did:example:issuer' }))).status).toBe(
        'success'
      );
    });

    it('fails at /issuer when the string is not a URL', async () => {
      expect(pointers(await run(v2({ issuer: 'not a url' })))).toEqual([
        '/issuer'
      ]);
    });

    it('fails at /issuer/id when the object has no id', async () => {
      const cred = v2();
      cred.issuer = { type: ['Profile'], name: 'No Id' };
      expect(pointers(await run(cred))).toEqual(['/issuer/id']);
    });

    it('fails at /issuer/id when the object id is not a URL', async () => {
      expect(pointers(await run(v2({ issuer: { id: 'not a url' } })))).toEqual([
        '/issuer/id'
      ]);
    });

    it.each([
      ['null', null],
      ['an array', ['did:example:issuer']],
      ['a number', 42]
    ])('fails at /issuer when it is %s', async (_label, value) => {
      expect(pointers(await run(v2({ issuer: value })))).toEqual(['/issuer']);
    });
  });

  describe('v1 dates', () => {
    it('fails at /issuanceDate when missing', async () => {
      const cred = v1();
      delete cred.issuanceDate;
      expect(pointers(await run(cred))).toEqual(['/issuanceDate']);
    });

    it('fails at /issuanceDate when not a dateTime', async () => {
      expect(pointers(await run(v1({ issuanceDate: '2024-01-01' })))).toEqual([
        '/issuanceDate'
      ]);
    });

    it('fails at /expirationDate when not a dateTime', async () => {
      expect(pointers(await run(v1({ expirationDate: 'tomorrow' })))).toEqual([
        '/expirationDate'
      ]);
    });

    it('checks format only, never the clock', async () => {
      const outcome = await run(
        v1({
          issuanceDate: '2999-01-01T00:00:00Z',
          expirationDate: '2000-01-01T00:00:00Z'
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('does not apply the v2 date rules to a v1 credential', async () => {
      expect((await run(v1({ validFrom: 'not a date' }))).status).toBe(
        'success'
      );
    });
  });

  describe('v2 dates', () => {
    it('passes without validFrom or validUntil', async () => {
      const cred = v2();
      delete cred.validFrom;
      expect((await run(cred)).status).toBe('success');
    });

    it('fails at /validFrom when not a dateTime', async () => {
      expect(pointers(await run(v2({ validFrom: 'yesterday' })))).toEqual([
        '/validFrom'
      ]);
    });

    it('fails at /validUntil when not a dateTime', async () => {
      expect(pointers(await run(v2({ validUntil: 12345 })))).toEqual([
        '/validUntil'
      ]);
    });

    it('checks format only, never the clock', async () => {
      const outcome = await run(
        v2({
          validFrom: '2999-01-01T00:00:00Z',
          validUntil: '2000-01-01T00:00:00.123+05:30'
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('does not require issuanceDate on a v2 credential', async () => {
      expect((await run(v2({ issuanceDate: undefined }))).status).toBe(
        'success'
      );
    });
  });

  describe('first @context entry', () => {
    const v2Context = 'https://www.w3.org/ns/credentials/v2';

    it('fails at /@context/0 when the VC context is not first', async () => {
      const outcome = await run(
        v2({ '@context': ['https://example.com/custom', v2Context] })
      );
      expect(pointers(outcome)).toEqual(['/@context/0']);
      if (outcome.status === 'failure') {
        expect(outcome.problems[0].detail).toBe(
          'The first "@context" entry must be ' +
            '"https://www.w3.org/2018/credentials/v1" or ' +
            '"https://www.w3.org/ns/credentials/v2".'
        );
      }
    });

    it('fails at /@context/0 when the first entry is an object', async () => {
      const outcome = await run(
        v2({ '@context': [{ '@vocab': 'https://example.com/#' }, v2Context] })
      );
      expect(pointers(outcome)).toEqual(['/@context/0']);
    });

    it('passes a single-string VC context', async () => {
      expect((await run(v2({ '@context': v2Context }))).status).toBe('success');
    });

    it('leaves a missing VC context to core.vc-context', async () => {
      const outcome = await run(
        v2({ '@context': ['https://example.com/custom'] })
      );
      expect(outcome.status).toBe('success');
    });

    it('fails the suite at core.vc-structure, after core.vc-context passes', async () => {
      const results = await runSuites(
        [coreSuite],
        {
          verifiableCredential: v2({
            '@context': ['https://example.com/custom', v2Context]
          })
        },
        context
      );
      expect(results.map(r => [r.check, r.outcome.status])).toEqual([
        ['core.context-exists', 'success'],
        ['core.vc-context', 'success'],
        ['core.vc-structure', 'failure'],
        ['core.credential-id', 'skipped'],
        ['core.proof-exists', 'skipped']
      ]);
    });

    it('applies only the version-independent rules when it is not a VC context', async () => {
      const outcome = await run(
        v2({
          '@context': ['https://example.com/custom', v2Context],
          validFrom: 'not a date',
          issuer: 'not a url'
        })
      );
      expect(pointers(outcome)).toEqual(['/@context/0', '/issuer']);
    });
  });

  describe.each(['credentialStatus', 'proof', 'termsOfUse', 'evidence'])(
    'typed property %s',
    prop => {
      it(`fails at /${prop} when it is not an object`, async () => {
        const outcome = await run(v2({ [prop]: 'a string' }));
        expect(pointers(outcome)).toEqual([`/${prop}`]);
      });

      it(`fails at /${prop} when it is null`, async () => {
        expect(pointers(await run(v2({ [prop]: null })))).toEqual([`/${prop}`]);
      });

      it(`fails at /${prop}/type when only type is missing`, async () => {
        const cred = v2();
        cred[prop] = { id: 'urn:uuid:1' };
        const outcome = await run(cred);
        expect(pointers(outcome)).toEqual([`/${prop}/type`]);
        if (outcome.status === 'failure') {
          expect(outcome.problems[0].detail).toBe(
            `"${prop}" must have a "type".`
          );
        }
      });

      it(`fails at /${prop}/<i> for bad array entries`, async () => {
        const outcome = await run(
          v2({ [prop]: [{ type: 'Ok' }, 7, { id: 'urn:uuid:1' }] })
        );
        expect(pointers(outcome)).toEqual([`/${prop}/1`, `/${prop}/2/type`]);
      });
    }
  );

  describe('credentialStatus id', () => {
    it('fails at /credentialStatus/id when not a URL', async () => {
      const outcome = await run(
        v2({ credentialStatus: { type: 'BitstringStatusListEntry', id: 'x' } })
      );
      expect(pointers(outcome)).toEqual(['/credentialStatus/id']);
    });

    it('fails at /credentialStatus/<i>/id in an array', async () => {
      const outcome = await run(
        v2({
          credentialStatus: [
            { type: 'BitstringStatusListEntry', id: 'https://e.test/s#1' },
            { type: 'BitstringStatusListEntry', id: 'x' }
          ]
        })
      );
      expect(pointers(outcome)).toEqual(['/credentialStatus/1/id']);
    });
  });

  describe('evidence id', () => {
    it('fails at /evidence/id when not a URL', async () => {
      const outcome = await run(
        v2({ evidence: { type: ['Evidence'], id: 'x' } })
      );
      expect(pointers(outcome)).toEqual(['/evidence/id']);
    });

    it('passes evidence with no id', async () => {
      const outcome = await run(v2({ evidence: { type: ['Evidence'] } }));
      expect(outcome.status).toBe('success');
    });
  });

  describe('credentialSchema', () => {
    const schema = {
      id: 'https://example.test/schema.json',
      type: '1EdTechJsonSchemaValidator2019'
    };

    it('passes an object with a type and a URL id', async () => {
      expect((await run(v2({ credentialSchema: [schema] }))).status).toBe(
        'success'
      );
    });

    it('fails at /credentialSchema when not an object', async () => {
      expect(pointers(await run(v2({ credentialSchema: 'x' })))).toEqual([
        '/credentialSchema'
      ]);
    });

    it('fails at /credentialSchema/type when type is missing', async () => {
      const outcome = await run(v2({ credentialSchema: { id: schema.id } }));
      expect(pointers(outcome)).toEqual(['/credentialSchema/type']);
    });

    it('fails at /credentialSchema/id when id is missing', async () => {
      const outcome = await run(
        v2({ credentialSchema: { type: schema.type } })
      );
      expect(pointers(outcome)).toEqual(['/credentialSchema/id']);
    });

    it('fails at /credentialSchema/<i>/id when id is not a URL', async () => {
      const outcome = await run(
        v2({ credentialSchema: [schema, { ...schema, id: 'not a url' }] })
      );
      expect(pointers(outcome)).toEqual(['/credentialSchema/1/id']);
    });
  });

  it('reports every violation in one failure', async () => {
    const cred = v2({
      type: ['OpenBadgeCredential'],
      validFrom: 'not a date',
      credentialStatus: [{ id: 'not a url' }],
      credentialSchema: { type: 'X' }
    });
    cred.credentialSubject = {};
    cred.issuer = { name: 'No Id' };
    const outcome = await run(cred);
    expect(pointers(outcome)).toEqual([
      '/type',
      '/credentialSubject',
      '/issuer/id',
      '/validFrom',
      '/credentialStatus/0/type',
      '/credentialStatus/0/id',
      '/credentialSchema/id'
    ]);
  });

  describe('spec-legal shapes pass', () => {
    it('a 1EdTechRevocationList status entry with no Bitstring fields', async () => {
      const outcome = await run(
        v2({
          credentialStatus: {
            id: 'https://example.test/revocations/1',
            type: '1EdTechRevocationList'
          }
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('a BitstringStatusListEntry with no id', async () => {
      const outcome = await run(
        v2({
          credentialStatus: {
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: '1',
            statusListCredential: 'https://example.test/status/1'
          }
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('name as a language value object', async () => {
      const outcome = await run(
        v2({ name: { '@value': 'Factory Credential', '@language': 'en' } })
      );
      expect(outcome.status).toBe('success');
    });

    it('name as an array of language value objects', async () => {
      const outcome = await run(
        v2({
          name: [
            { '@value': 'Factory Credential', '@language': 'en' },
            { '@value': 'Fabrikzeugnis', '@language': 'de' }
          ]
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('an issuer image object', async () => {
      const outcome = await run(
        v2({
          issuer: {
            image: {
              id: 'https://example.test/logo.png',
              type: 'Image',
              caption: 'Logo'
            }
          }
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('an issuer name as a language value object', async () => {
      const outcome = await run(
        v2({ issuer: { name: { '@value': 'Issuer', '@language': 'en' } } })
      );
      expect(outcome.status).toBe('success');
    });
  });
});

describe('vp-structure', () => {
  const context = buildTestContext();

  const run = (presentation: unknown) =>
    vpStructureCheck.execute({ verifiablePresentation: presentation }, context);

  const pointers = (outcome: CheckOutcome): Array<string | undefined> => {
    expect(outcome.status).toBe('failure');
    return outcome.status === 'failure'
      ? outcome.problems.map(p => p.instance)
      : [];
  };

  it('is fatal and applies only to presentations', () => {
    expect(vpStructureCheck.id).toBe('core.vp-structure');
    expect(vpStructureCheck.fatal).toBe(true);
    expect(vpStructureCheck.appliesTo).toEqual(['verifiablePresentation']);
  });

  it('passes a factory presentation', async () => {
    expect(await run(PresentationFactory())).toEqual({
      status: 'success',
      message: 'Presentation structure conforms to the VC Data Model.'
    });
  });

  it('fails when the subject has no presentation object', async () => {
    const outcome = await run(null);
    expect(outcome.status).toBe('failure');
    if (outcome.status === 'failure') {
      expect(outcome.problems[0].detail).toContain(
        'No verifiable presentation'
      );
    }
  });

  it('is the only core check that runs for a presentation subject', async () => {
    const results = await runSuites(
      [coreSuite],
      { verifiablePresentation: PresentationFactory() },
      context
    );
    expect(results.map(r => r.check)).toEqual(['core.vp-structure']);
    expect(results[0].outcome.status).toBe('success');
  });

  it('does not run for a credential subject', async () => {
    const results = await runSuites(
      [coreSuite],
      { verifiableCredential: CredentialFactory() },
      context
    );
    expect(results.map(r => r.check)).not.toContain('core.vp-structure');
  });

  describe('@context', () => {
    it('passes a v1 context', async () => {
      const outcome = await run(
        PresentationFactory({
          '@context': 'https://www.w3.org/2018/credentials/v1'
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('fails at /@context without a VC context', async () => {
      const outcome = await run(
        PresentationFactory({ '@context': ['https://example.com/custom'] })
      );
      expect(pointers(outcome)).toEqual(['/@context']);
    });

    it('fails at /@context when missing', async () => {
      const vp = PresentationFactory();
      delete vp['@context'];
      expect(pointers(await run(vp))).toEqual(['/@context']);
    });

    it('fails at /@context/0 when the VC context is not first', async () => {
      const outcome = await run(
        PresentationFactory({
          '@context': [
            'https://example.com/custom',
            'https://www.w3.org/ns/credentials/v2'
          ]
        })
      );
      expect(pointers(outcome)).toEqual(['/@context/0']);
    });

    it('fails at /@context/0 when the first entry is an object', async () => {
      const outcome = await run(
        PresentationFactory({
          '@context': [
            { '@vocab': 'https://example.com/#' },
            'https://www.w3.org/ns/credentials/v2'
          ]
        })
      );
      expect(pointers(outcome)).toEqual(['/@context/0']);
    });

    it('passes a single-string VC context', async () => {
      const outcome = await run(
        PresentationFactory({
          '@context': 'https://www.w3.org/ns/credentials/v2'
        })
      );
      expect(outcome.status).toBe('success');
    });
  });

  describe('type', () => {
    it('fails at /type without VerifiablePresentation', async () => {
      const outcome = await run(PresentationFactory({ type: ['Other'] }));
      expect(pointers(outcome)).toEqual(['/type']);
    });

    it('fails at /type when missing', async () => {
      const vp = PresentationFactory();
      delete vp.type;
      expect(pointers(await run(vp))).toEqual(['/type']);
    });

    it('passes a single-string type', async () => {
      const outcome = await run(
        PresentationFactory({ type: 'VerifiablePresentation' })
      );
      expect(outcome.status).toBe('success');
    });
  });

  describe('id', () => {
    it('passes a URN id', async () => {
      const outcome = await run(
        PresentationFactory({
          id: 'urn:uuid:3978344f-8596-4c3a-a978-8fcaba3903c5'
        })
      );
      expect(outcome.status).toBe('success');
    });

    it('fails at /id when not a URL', async () => {
      expect(pointers(await run(PresentationFactory({ id: 'nope' })))).toEqual([
        '/id'
      ]);
    });
  });

  describe('holder', () => {
    it('passes a holder object with a DID id', async () => {
      const outcome = await run(
        PresentationFactory({ holder: { id: DEFAULT_TEST_ISSUER_DID } })
      );
      expect(outcome.status).toBe('success');
    });

    it('passes without a holder', async () => {
      const vp = PresentationFactory();
      delete vp.holder;
      expect((await run(vp)).status).toBe('success');
    });

    it('fails at /holder when the string is not a URL', async () => {
      expect(
        pointers(await run(PresentationFactory({ holder: 'not a url' })))
      ).toEqual(['/holder']);
    });

    it('fails at /holder when it is neither a string nor an object', async () => {
      expect(pointers(await run(PresentationFactory({ holder: 42 })))).toEqual([
        '/holder'
      ]);
    });

    it('fails at /holder/id when the object id is not a URL', async () => {
      const outcome = await run(
        PresentationFactory({ holder: { id: 'not a url' } })
      );
      expect(pointers(outcome)).toEqual(['/holder/id']);
    });
  });

  describe('proof', () => {
    it('passes a presentation with no proof', async () => {
      const vp = PresentationFactory();
      delete vp.proof;
      expect((await run(vp)).status).toBe('success');
    });

    it('fails at /proof when not an object', async () => {
      expect(pointers(await run(PresentationFactory({ proof: 'x' })))).toEqual([
        '/proof'
      ]);
    });

    it('fails at /proof/type when type is missing', async () => {
      const vp = PresentationFactory();
      vp.proof = { proofPurpose: 'authentication' };
      expect(pointers(await run(vp))).toEqual(['/proof/type']);
    });

    it('fails at /proof/<i> for a bad array entry', async () => {
      const outcome = await run(
        PresentationFactory({ proof: [{ type: 'DataIntegrityProof' }, null] })
      );
      expect(pointers(outcome)).toEqual(['/proof/1']);
    });
  });

  describe('verifiableCredential', () => {
    it('passes a single embedded credential object', async () => {
      const outcome = await run(
        PresentationFactory({ verifiableCredential: CredentialFactory() })
      );
      expect(outcome.status).toBe('success');
    });

    it('fails at /verifiableCredential when a single value is not an object', async () => {
      const outcome = await run(
        PresentationFactory({ verifiableCredential: 'eyJhbGciOi...' })
      );
      expect(pointers(outcome)).toEqual(['/verifiableCredential']);
    });

    it('fails at /verifiableCredential/<i> for bad entries', async () => {
      const outcome = await run(
        PresentationFactory({
          verifiableCredential: [CredentialFactory(), null, []]
        })
      );
      expect(pointers(outcome)).toEqual([
        '/verifiableCredential/1',
        '/verifiableCredential/2'
      ]);
    });

    it('does not check the contents of embedded credentials', async () => {
      const outcome = await run(
        PresentationFactory({ verifiableCredential: [{ type: 'Nonsense' }] })
      );
      expect(outcome.status).toBe('success');
    });
  });

  it('reports every violation in one failure', async () => {
    const vp = PresentationFactory({
      '@context': ['https://example.com/custom'],
      type: ['Other'],
      id: 'nope',
      holder: 'not a url',
      verifiableCredential: ['x']
    });
    vp.proof = { challenge: 'c' };
    const outcome = await run(vp);
    expect(pointers(outcome)).toEqual([
      '/@context',
      '/type',
      '/id',
      '/holder',
      '/proof/type',
      '/verifiableCredential/0'
    ]);
    if (outcome.status === 'failure') {
      for (const p of outcome.problems) {
        expect(p.type).toBe(ProblemTypes.PARSING_ERROR);
        expect(p.title).toBe('Invalid Presentation Structure');
      }
    }
  });
});
