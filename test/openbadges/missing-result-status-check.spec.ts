import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { obv3MissingResultStatusCheck } from '../../src/openbadges/missing-result-status-check.js';
import { VerificationSuite } from '../../src/types/check.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { compose } from '../factories/data/compose.js';
import { addResults } from '../factories/data/transforms.js';
import { formatJsonPointer } from '../../src/util/json-pointer.js';

const missingStatusSuite: VerificationSuite = {
  id: 'openbadges.missing-result-status',
  name: 'OBv3 Missing Result Status (test wrapper)',
  description:
    'Test-only single-check suite around obv3MissingResultStatusCheck.',
  checks: [obv3MissingResultStatusCheck]
};

const createSubject = (credential: unknown): VerificationSubject => ({
  verifiableCredential: credential
});

const RD_STATUS_ID = 'https://example.test/result-descriptions/status';
const RD_NUMERIC_ID = 'https://example.test/result-descriptions/numeric';

describe('OBv3 missing-result-status check', () => {
  it('skips when credential has no results', async () => {
    const cred = CredentialFactory({ version: 'v2', credential: {} });
    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('skipped');
  });

  it('skips when achievement has no resultDescription[]', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [{ type: 'Result', value: 'Pass' }],
        resultDescriptions: []
      })
    );

    const cs = cred.credentialSubject as Record<string, unknown>;
    const achievement = cs.achievement as Record<string, unknown>;
    delete achievement.resultDescription;

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('skipped');
  });

  it('succeeds (not applicable) when no ResultDescription has resultType Status', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          { type: 'Result', resultDescription: RD_NUMERIC_ID, value: '42' }
        ],
        resultDescriptions: [
          {
            id: RD_NUMERIC_ID,
            type: 'ResultDescription',
            name: 'Score',
            resultType: 'NumericGrade'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('not applicable');
    }
  });

  it('succeeds when all Status-typed results carry a status value', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            status: 'Completed'
          },
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            status: 'Failed'
          }
        ],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('2 Status-typed');
    }
  });

  it('fails when a Status-typed result is missing the status field', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            value: 'Completed'
          }
        ],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems).toHaveLength(1);
      expect(check.outcome.problems[0].type).toBe(
        'https://www.w3.org/TR/vc-data-model#OB_MISSING_RESULT_STATUS'
      );
      expect(check.outcome.problems[0].detail).toContain('index 0');
      expect(check.outcome.problems[0].detail).toContain(RD_STATUS_ID);
      expect(check.outcome.problems[0].instance).toBe(
        formatJsonPointer(['credentialSubject', 'result', 0])
      );
    }
  });

  it('treats empty-string status as missing', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          { type: 'Result', resultDescription: RD_STATUS_ID, status: '' }
        ],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems).toHaveLength(1);
    }
  });

  it('does not flag results pointing at a non-Status ResultDescription', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          { type: 'Result', resultDescription: RD_NUMERIC_ID, value: '88' },
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            status: 'Completed'
          }
        ],
        resultDescriptions: [
          {
            id: RD_NUMERIC_ID,
            type: 'ResultDescription',
            name: 'Score',
            resultType: 'NumericGrade'
          },
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('1 Status-typed');
    }
  });

  it('does not flag results that are missing resultDescription entirely', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [{ type: 'Result', value: 'Pass' }],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('success');
  });

  it('treats lowercase "status" resultType as not-Status (case-sensitive)', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          { type: 'Result', resultDescription: RD_STATUS_ID, value: 'Pass' }
        ],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('not applicable');
    }
  });

  it('emits one ProblemDetail per missing entry, in order', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            status: 'Completed'
          },
          {
            type: 'Result',
            resultDescription: RD_STATUS_ID,
            value: 'lacks status'
          },
          { type: 'Result', resultDescription: RD_STATUS_ID, status: '' }
        ],
        resultDescriptions: [
          {
            id: RD_STATUS_ID,
            type: 'ResultDescription',
            name: 'Course Status',
            resultType: 'Status'
          }
        ]
      })
    );

    const results = await runSuites(
      [missingStatusSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(
      r => r.check === 'schema.obv3.missing-result-status'
    );
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems).toHaveLength(2);
      expect(check.outcome.problems[0].detail).toContain('index 1');
      expect(check.outcome.problems[1].detail).toContain('index 2');
      expect(check.outcome.problems.map(p => p.instance)).toEqual([
        formatJsonPointer(['credentialSubject', 'result', 1]),
        formatJsonPointer(['credentialSubject', 'result', 2])
      ]);
    }
  });
});
