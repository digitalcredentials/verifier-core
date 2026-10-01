import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { obv3ResultRefCheck } from '../../src/openbadges/result-ref-check.js';
import { VerificationSuite } from '../../src/types/check.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { compose } from '../factories/data/compose.js';
import { addResults } from '../factories/data/transforms.js';
import { formatJsonPointer } from '../../src/util/json-pointer.js';

const resultRefSuite: VerificationSuite = {
  id: 'openbadges.result-ref',
  name: 'OBv3 Result Reference (test wrapper)',
  description: 'Test-only single-check suite around obv3ResultRefCheck.',
  checks: [obv3ResultRefCheck]
};

const createSubject = (credential: unknown): VerificationSubject => ({
  verifiableCredential: credential
});

describe('OBv3 result-ref check', () => {
  it('skips when credential has no results', async () => {
    const cred = CredentialFactory({ version: 'v2', credential: {} });
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('skipped');
  });

  it('validates correct result references', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/1',
            value: 'Pass'
          }
        ],
        resultDescriptions: [
          {
            id: 'https://example.test/result-descriptions/1',
            type: 'ResultDescription',
            name: 'Test Score'
          }
        ]
      })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('success');
    if (refCheck?.outcome.status === 'success') {
      expect(refCheck.outcome.message).toContain(
        'result entries reference valid'
      );
    }
  });

  it('validates compose-generated cross references', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2' }),
      addResults({ count: 3 })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('success');
  });

  it('fails for invalid result references', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/999',
            value: 'Pass'
          }
        ],
        resultDescriptions: [
          {
            id: 'https://example.test/result-descriptions/1',
            type: 'ResultDescription',
            name: 'Test Score'
          }
        ]
      })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('failure');
    if (refCheck?.outcome.status === 'failure') {
      expect(refCheck.outcome.problems[0].type).toBe(
        'https://www.w3.org/TR/vc-data-model#OB_INVALID_RESULT_REFERENCE'
      );
      expect(refCheck.outcome.problems[0].detail).toContain('does not exist');
      expect(refCheck.outcome.problems[0].instance).toBe(
        formatJsonPointer([
          'credentialSubject',
          'result',
          0,
          'resultDescription'
        ])
      );
    }
  });

  it('handles multiple result entries with mixed references', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/1',
            value: 'Pass'
          },
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/999',
            value: 'Fail'
          }
        ],
        resultDescriptions: [
          {
            id: 'https://example.test/result-descriptions/1',
            type: 'ResultDescription',
            name: 'Test Score'
          }
        ]
      })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('failure');
    if (refCheck?.outcome.status === 'failure') {
      expect(refCheck.outcome.problems).toHaveLength(1);
      expect(refCheck.outcome.problems[0].detail).toContain('index 1');
      expect(refCheck.outcome.problems[0].instance).toBe(
        formatJsonPointer([
          'credentialSubject',
          'result',
          1,
          'resultDescription'
        ])
      );
    }
  });

  it('emits one instance pointer per offending entry', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription:
              'https://example.test/result-descriptions/missing-a',
            value: 'A'
          },
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/1',
            value: 'B'
          },
          {
            type: 'Result',
            resultDescription:
              'https://example.test/result-descriptions/missing-c',
            value: 'C'
          }
        ],
        resultDescriptions: [
          {
            id: 'https://example.test/result-descriptions/1',
            type: 'ResultDescription',
            name: 'Test Score'
          }
        ]
      })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('failure');
    if (refCheck?.outcome.status === 'failure') {
      const instances = refCheck.outcome.problems.map(p => p.instance);
      expect(instances).toEqual([
        formatJsonPointer([
          'credentialSubject',
          'result',
          0,
          'resultDescription'
        ]),
        formatJsonPointer([
          'credentialSubject',
          'result',
          2,
          'resultDescription'
        ])
      ]);
    }
  });

  it('skips when result entry has no resultDescription', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [{ type: 'Result', value: 'Pass' }],
        resultDescriptions: [
          {
            id: 'https://example.test/result-descriptions/1',
            type: 'ResultDescription',
            name: 'Test Score'
          }
        ]
      })
    );
    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('success');
  });

  it('fails when achievement has no resultDescription for referenced id', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: 'https://example.test/result-descriptions/1',
            value: 'Pass'
          }
        ],
        resultDescriptions: []
      })
    );
    const cs = cred.credentialSubject as Record<string, unknown>;
    const achievement = cs.achievement as Record<string, unknown>;
    achievement.resultDescription = [];

    const results = await runSuites(
      [resultRefSuite],
      createSubject(cred),
      buildTestContext()
    );

    const refCheck = results.find(r => r.check === 'schema.obv3.result-ref');
    expect(refCheck?.outcome.status).toBe('failure');
    if (refCheck?.outcome.status === 'failure') {
      expect(refCheck.outcome.problems[0].type).toBe(
        'https://www.w3.org/TR/vc-data-model#OB_INVALID_RESULT_REFERENCE'
      );
    }
  });
});
