/**
 * Spec for the Phase-7 OB 3.0 result trio:
 * - RubricCriterionLevel (§B.1.18)
 * - ResultDescription (§B.1.17)
 * - Result (§B.1.16)
 *
 * Also asserts the backfill into
 * `Achievement.resultDescription[]` and
 * `AchievementSubject.result[]`, including precise JSON Pointer
 * attribution for malformed nested entries when validated through
 * the envelope.
 *
 * Phase 7 closes out the strict envelope; Phase 8 will refactor
 * the existing OB semantic checks (achieved-level, result-ref) to
 * consume this normalized form via `recognizedProfile`.
 */

import { describe, it, expect } from 'vitest';
import {
  Obv3p0ResultDescriptionSchema,
  Obv3p0ResultSchema,
  Obv3p0RubricCriterionLevelSchema
} from '../../../src/openbadges/schemas/classes-v3p0.js';
import { parseObv3p0OpenBadgeCredential } from '../../../src/openbadges/schemas/openbadge-credential-v3p0.js';
import type { RecognitionResult } from '../../../src/types/recognition.js';
import { obv3p0OpenBadgeSpecConforming } from '../fixtures/obv3p0-openbadge-spec-conforming.js';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function assertMalformedAt(
  result: RecognitionResult,
  expectedInstance: string
): void {
  expect(result.status).toBe('malformed');
  if (result.status === 'malformed') {
    const matched = result.problems.find(p => p.instance === expectedInstance);
    expect(
      matched,
      `expected a problem at ${expectedInstance}, got ${JSON.stringify(
        result.problems.map(p => p.instance)
      )}`
    ).toBeDefined();
  }
}

const minimalRubricLevel = {
  id: 'urn:example:rcl/pass',
  type: ['RubricCriterionLevel'],
  name: 'Pass'
};

const minimalResultDescription = {
  id: 'urn:example:rd/score',
  type: ['ResultDescription'],
  name: 'Score',
  resultType: 'LetterGrade'
};

describe('Obv3p0RubricCriterionLevelSchema', () => {
  it('parses a minimal-required level', () => {
    const parsed =
      Obv3p0RubricCriterionLevelSchema.safeParse(minimalRubricLevel);
    expect(parsed.success).toBe(true);
  });

  it('round-trips a level with all in-scope optionals', () => {
    const parsed = Obv3p0RubricCriterionLevelSchema.safeParse({
      ...minimalRubricLevel,
      description: 'Performance meets expectations.',
      level: '2',
      points: '10',
      alignment: [
        {
          type: ['Alignment'],
          targetName: 'Skill A',
          targetUrl: 'https://example.test/a'
        }
      ]
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a level missing name', () => {
    const { name: _drop, ...rest } = minimalRubricLevel;
    const parsed = Obv3p0RubricCriterionLevelSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-URL id', () => {
    const parsed = Obv3p0RubricCriterionLevelSchema.safeParse({
      ...minimalRubricLevel,
      id: 'not-a-url'
    });
    expect(parsed.success).toBe(false);
  });
});

describe('Obv3p0ResultDescriptionSchema', () => {
  it('parses a minimal-required description', () => {
    const parsed = Obv3p0ResultDescriptionSchema.safeParse(
      minimalResultDescription
    );
    expect(parsed.success).toBe(true);
  });

  it('round-trips with rubricCriterionLevel[] and allowedValue[]', () => {
    const parsed = Obv3p0ResultDescriptionSchema.safeParse({
      ...minimalResultDescription,
      rubricCriterionLevel: [
        minimalRubricLevel,
        { ...minimalRubricLevel, id: 'urn:example:rcl/fail', name: 'Fail' }
      ],
      allowedValue: ['A', 'B', 'C', 'D', 'F'],
      requiredLevel: minimalRubricLevel.id,
      requiredValue: 'C',
      valueMin: 'F',
      valueMax: 'A'
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a description missing resultType', () => {
    const { resultType: _drop, ...rest } = minimalResultDescription;
    const parsed = Obv3p0ResultDescriptionSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it('rejects a description missing name', () => {
    const { name: _drop, ...rest } = minimalResultDescription;
    const parsed = Obv3p0ResultDescriptionSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it('reports per-entry path for malformed rubricCriterionLevel[1]', () => {
    const parsed = Obv3p0ResultDescriptionSchema.safeParse({
      ...minimalResultDescription,
      rubricCriterionLevel: [
        minimalRubricLevel,
        { id: 'urn:example:rcl/missing-name', type: ['RubricCriterionLevel'] }
      ]
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        i => i.path.join('.') === 'rubricCriterionLevel.1.name'
      );
      expect(
        issue,
        `expected an issue at rubricCriterionLevel.1.name, got ${JSON.stringify(
          parsed.error.issues.map(i => i.path)
        )}`
      ).toBeDefined();
    }
  });
});

describe('Obv3p0ResultSchema', () => {
  it('parses a minimal-required result', () => {
    const parsed = Obv3p0ResultSchema.safeParse({ type: ['Result'] });
    expect(parsed.success).toBe(true);
  });

  it('round-trips a result with achievedLevel and resultDescription ref', () => {
    const parsed = Obv3p0ResultSchema.safeParse({
      type: ['Result'],
      achievedLevel: 'urn:example:rcl/pass',
      resultDescription: 'urn:example:rd/score',
      status: 'Completed',
      value: 'A'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.achievedLevel).toBe('urn:example:rcl/pass');
      expect(parsed.data.value).toBe('A');
    }
  });

  it('rejects a result whose resultDescription is not a URL', () => {
    const parsed = Obv3p0ResultSchema.safeParse({
      type: ['Result'],
      resultDescription: 'not-a-url'
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a result missing type', () => {
    const parsed = Obv3p0ResultSchema.safeParse({ value: 'A' });
    expect(parsed.success).toBe(false);
  });
});

describe('Result + ResultDescription backfilled into envelope', () => {
  function credentialWith(
    achievementOverlay: object,
    resultEntries: unknown[]
  ) {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    const subject = cred.credentialSubject as Record<string, unknown>;
    const achievement = subject.achievement as Record<string, unknown>;
    cred.credentialSubject = {
      ...subject,
      result: resultEntries,
      achievement: { ...achievement, ...achievementOverlay }
    };
    return cred;
  }

  it('parses a credential with cross-referenced result + resultDescription', () => {
    const cred = credentialWith(
      {
        resultDescription: [
          {
            ...minimalResultDescription,
            rubricCriterionLevel: [minimalRubricLevel]
          }
        ]
      },
      [
        {
          type: ['Result'],
          resultDescription: minimalResultDescription.id,
          achievedLevel: minimalRubricLevel.id,
          value: 'A'
        }
      ]
    );

    const result = parseObv3p0OpenBadgeCredential(cred);
    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        credentialSubject: { result: Array<{ value: string }> };
      };
      expect(normalized.credentialSubject.result[0].value).toBe('A');
    }
  });

  it('attributes a malformed Result.resultDescription deep at /credentialSubject/result/0/resultDescription', () => {
    const cred = credentialWith({}, [
      { type: ['Result'], resultDescription: 'not-a-url' }
    ]);

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/credentialSubject/result/0/resultDescription');
  });

  it('attributes a malformed nested rubric level deep at /credentialSubject/achievement/resultDescription/0/rubricCriterionLevel/1/name', () => {
    const cred = credentialWith(
      {
        resultDescription: [
          {
            ...minimalResultDescription,
            rubricCriterionLevel: [
              minimalRubricLevel,
              {
                id: 'urn:example:rcl/missing-name',
                type: ['RubricCriterionLevel']
              }
            ]
          }
        ]
      },
      []
    );

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(
      result,
      '/credentialSubject/achievement/resultDescription/0/rubricCriterionLevel/1/name'
    );
  });

  it('still parses the spec-conforming fixture (no result data) cleanly', () => {
    const result = parseObv3p0OpenBadgeCredential(
      obv3p0OpenBadgeSpecConforming
    );
    expect(result.status).toBe('recognized');
  });
});
