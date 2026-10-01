import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import {
  obv3UnknownAchievementTypeCheck,
  createObv3UnknownAchievementTypeCheck
} from '../../src/openbadges/unknown-achievement-type-check.js';
import { VerificationCheck, VerificationSuite } from '../../src/types/check.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { formatJsonPointer } from '../../src/util/json-pointer.js';

const CHECK_ID = 'schema.obv3.unknown-achievement-type';

const wrap = (check: VerificationCheck): VerificationSuite => ({
  id: 'openbadges.unknown-achievement-type',
  name: 'OBv3 Unknown AchievementType (test wrapper)',
  description: 'Test-only single-check suite.',
  checks: [check]
});

const createSubject = (credential: unknown): VerificationSubject => ({
  verifiableCredential: credential
});

function withAchievementType(value: unknown): Record<string, unknown> {
  const cred = CredentialFactory({ version: 'v2', credential: {} });
  const cs = cred.credentialSubject as Record<string, unknown>;
  const achievement = cs.achievement as Record<string, unknown>;
  achievement.achievementType = value;
  return cred;
}

async function runCheck(
  check: VerificationCheck,
  credential: Record<string, unknown>
) {
  const results = await runSuites(
    [wrap(check)],
    createSubject(credential),
    buildTestContext()
  );
  return results.find(r => r.check === CHECK_ID);
}

describe('OBv3 unknown-achievement-type check', () => {
  describe('plain check (built-in vocabulary only)', () => {
    it('skips when credential has no achievement.achievementType', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('skipped');
    });

    it('succeeds for a built-in single-string value', async () => {
      const cred = withAchievementType('Course');
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('succeeds for a built-in array of values', async () => {
      const cred = withAchievementType(['Course', 'Diploma', 'Degree']);
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('succeeds for an "ext:" extension token', async () => {
      const cred = withAchievementType('ext:CompanyInternalCertification');
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('succeeds for an array mixing built-ins and ext: extensions', async () => {
      const cred = withAchievementType(['Course', 'ext:Conference', 'Badge']);
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('fails for an unknown single-string value', async () => {
      const cred = withAchievementType('NotARealType');
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('failure');
      if (result?.outcome.status === 'failure') {
        expect(result.outcome.problems).toHaveLength(1);
        expect(result.outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#OB_UNKNOWN_ACHIEVEMENT_TYPE'
        );
        expect(result.outcome.problems[0].detail).toContain('NotARealType');
        expect(result.outcome.problems[0].detail).toContain(
          'achievement.achievementType ='
        );
        expect(result.outcome.problems[0].instance).toBe(
          formatJsonPointer([
            'credentialSubject',
            'achievement',
            'achievementType'
          ])
        );
      }
    });

    it('emits one problem per unknown array entry, with index in detail', async () => {
      const cred = withAchievementType([
        'Course',
        'NotARealType',
        'Diploma',
        'AlsoFake'
      ]);
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('failure');
      if (result?.outcome.status === 'failure') {
        expect(result.outcome.problems).toHaveLength(2);
        expect(result.outcome.problems[0].detail).toContain(
          'achievement.achievementType[1]'
        );
        expect(result.outcome.problems[0].detail).toContain('NotARealType');
        expect(result.outcome.problems[1].detail).toContain(
          'achievement.achievementType[3]'
        );
        expect(result.outcome.problems[1].detail).toContain('AlsoFake');
        expect(result.outcome.problems.map(p => p.instance)).toEqual([
          formatJsonPointer([
            'credentialSubject',
            'achievement',
            'achievementType',
            1
          ]),
          formatJsonPointer([
            'credentialSubject',
            'achievement',
            'achievementType',
            3
          ])
        ]);
      }
    });

    it('rejects a token that lacks the ext: prefix and is not in the vocab', async () => {
      const cred = withAchievementType('CompanyInternalCertification');
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('failure');
    });

    it('ignores non-string entries (shape errors are out of scope)', async () => {
      const cred = withAchievementType(['Course', 42, null, 'Diploma']);
      const result = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(result?.outcome.status).toBe('success');
    });
  });

  describe('factory variant (with additionalKnownTypes)', () => {
    it('accepts a token added via additionalKnownTypes', async () => {
      const check = createObv3UnknownAchievementTypeCheck({
        additionalKnownTypes: ['CompanyInternalCertification']
      });
      const cred = withAchievementType('CompanyInternalCertification');
      const result = await runCheck(check, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('still rejects tokens not in the augmented set or ext: namespace', async () => {
      const check = createObv3UnknownAchievementTypeCheck({
        additionalKnownTypes: ['CompanyInternalCertification']
      });
      const cred = withAchievementType('SomeOtherUnknownType');
      const result = await runCheck(check, cred);
      expect(result?.outcome.status).toBe('failure');
    });

    it('still honors the ext: prefix carve-out alongside additionalKnownTypes', async () => {
      const check = createObv3UnknownAchievementTypeCheck({
        additionalKnownTypes: ['CompanyInternalCertification']
      });
      const cred = withAchievementType([
        'ext:NewThing',
        'CompanyInternalCertification'
      ]);
      const result = await runCheck(check, cred);
      expect(result?.outcome.status).toBe('success');
    });

    it('matches the plain check when no augment is supplied', async () => {
      const factoryNoAugment = createObv3UnknownAchievementTypeCheck();
      const cred = withAchievementType('NotARealType');
      const fromFactory = await runCheck(factoryNoAugment, cred);
      const fromPlain = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(fromFactory?.outcome.status).toBe('failure');
      expect(fromPlain?.outcome.status).toBe('failure');
    });
  });

  describe('plain vs factory divergence', () => {
    it('plain check rejects a token that the factory accepts via additionalKnownTypes', async () => {
      const cred = withAchievementType('CompanyInternalCertification');

      const plainResult = await runCheck(obv3UnknownAchievementTypeCheck, cred);
      expect(plainResult?.outcome.status).toBe('failure');

      const factoryCheck = createObv3UnknownAchievementTypeCheck({
        additionalKnownTypes: ['CompanyInternalCertification']
      });
      const factoryResult = await runCheck(factoryCheck, cred);
      expect(factoryResult?.outcome.status).toBe('success');
    });
  });
});
