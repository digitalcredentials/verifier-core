import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { obv3AchievedLevelCheck } from '../../src/openbadges/achieved-level-check.js';
import { VerificationSuite } from '../../src/types/check.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { compose } from '../factories/data/compose.js';
import { addResults } from '../factories/data/transforms.js';
import { formatJsonPointer } from '../../src/util/json-pointer.js';

const achievedLevelSuite: VerificationSuite = {
  id: 'openbadges.achieved-level',
  name: 'OBv3 Achieved Level (test wrapper)',
  description: 'Test-only single-check suite around obv3AchievedLevelCheck.',
  checks: [obv3AchievedLevelCheck]
};

const createSubject = (credential: unknown): VerificationSubject => ({
  verifiableCredential: credential
});

const RD_ID = 'https://example.test/result-descriptions/1';
const LEVEL_PASS = 'https://example.test/levels/pass';
const LEVEL_FAIL = 'https://example.test/levels/fail';
const LEVEL_DISTINCTION = 'https://example.test/levels/distinction';

describe('OBv3 achieved-level check', () => {
  it('skips when credential has no results', async () => {
    const cred = CredentialFactory({ version: 'v2', credential: {} });
    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
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
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('skipped');
  });

  it('succeeds when results exist but none declare achievedLevel', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [{ type: 'Result', resultDescription: RD_ID, value: 'Pass' }],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('nothing to validate');
    }
  });

  it('succeeds when achievedLevel matches a declared RubricCriterionLevel id', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: LEVEL_PASS
          }
        ],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' },
              { id: LEVEL_FAIL, type: 'RubricCriterionLevel', name: 'Fail' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('1 achievedLevel');
    }
  });

  it('fails when achievedLevel is not in the declared level set', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: LEVEL_DISTINCTION
          }
        ],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' },
              { id: LEVEL_FAIL, type: 'RubricCriterionLevel', name: 'Fail' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems).toHaveLength(1);
      expect(check.outcome.problems[0].type).toBe(
        'https://www.w3.org/TR/vc-data-model#OB_INVALID_ACHIEVED_LEVEL'
      );
      expect(check.outcome.problems[0].detail).toContain(LEVEL_DISTINCTION);
      expect(check.outcome.problems[0].detail).toContain(LEVEL_PASS);
      expect(check.outcome.problems[0].instance).toBe(
        formatJsonPointer(['credentialSubject', 'result', 0, 'achievedLevel'])
      );
    }
  });

  it('fails when the referenced ResultDescription declares no rubricCriterionLevel[]', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: LEVEL_PASS
          }
        ],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'No-Levels'
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems[0].detail).toContain(
        'declares no rubricCriterionLevel'
      );
      expect(check.outcome.problems[0].instance).toBe(
        formatJsonPointer(['credentialSubject', 'result', 0, 'achievedLevel'])
      );
    }
  });

  it('fails when achievedLevel references a ResultDescription that does not exist', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription:
              'https://example.test/result-descriptions/missing',
            achievedLevel: LEVEL_PASS
          }
        ],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems[0].detail).toContain(
        'declares no rubricCriterionLevel'
      );
    }
  });

  it('does not flag results that have achievedLevel but no resultDescription', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [{ type: 'Result', achievedLevel: LEVEL_PASS }],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('success');
    if (check?.outcome.status === 'success') {
      expect(check.outcome.message).toContain('nothing to validate');
    }
  });

  it('emits one ProblemDetail per invalid entry, in order', async () => {
    const cred = compose(
      CredentialFactory({ version: 'v2', credential: {} }),
      addResults({
        results: [
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: LEVEL_PASS
          },
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: LEVEL_DISTINCTION
          },
          {
            type: 'Result',
            resultDescription: RD_ID,
            achievedLevel: 'https://example.test/levels/honors'
          }
        ],
        resultDescriptions: [
          {
            id: RD_ID,
            type: 'ResultDescription',
            name: 'Pass/Fail',
            rubricCriterionLevel: [
              { id: LEVEL_PASS, type: 'RubricCriterionLevel', name: 'Pass' },
              { id: LEVEL_FAIL, type: 'RubricCriterionLevel', name: 'Fail' }
            ]
          }
        ]
      })
    );

    const results = await runSuites(
      [achievedLevelSuite],
      createSubject(cred),
      buildTestContext()
    );

    const check = results.find(r => r.check === 'schema.obv3.achieved-level');
    expect(check?.outcome.status).toBe('failure');
    if (check?.outcome.status === 'failure') {
      expect(check.outcome.problems).toHaveLength(2);
      expect(check.outcome.problems[0].detail).toContain('index 1');
      expect(check.outcome.problems[0].detail).toContain(LEVEL_DISTINCTION);
      expect(check.outcome.problems[1].detail).toContain('index 2');
      expect(check.outcome.problems[1].detail).toContain('honors');
      expect(check.outcome.problems.map(p => p.instance)).toEqual([
        formatJsonPointer(['credentialSubject', 'result', 1, 'achievedLevel']),
        formatJsonPointer(['credentialSubject', 'result', 2, 'achievedLevel'])
      ]);
    }
  });
});
