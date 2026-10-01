/**
 * Spec for the Phase-6 OB 3.0 `AchievementSubject` (§B.1.3) class
 * schema, its **id-or-identifier[]** at-least-one refinement, and
 * its backfill into the top-level envelope's `credentialSubject`
 * slot.
 *
 * The standalone schema reports the at-least-one violation at the
 * subject root (path `[]`); when validated through the envelope,
 * that surfaces as `instance: '/credentialSubject'` via
 * `formatJsonPointer`.
 */

import { describe, it, expect } from 'vitest';
import { Obv3p0AchievementSubjectSchema } from '../../../src/openbadges/schemas/classes-v3p0.js';
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

const minimalAchievement = {
  id: 'urn:example:achievement-1',
  type: ['Achievement'],
  name: 'Example Achievement',
  description: 'Example achievement description.',
  criteria: { narrative: 'Pass the exam.' }
};

describe('Obv3p0AchievementSubjectSchema (standalone)', () => {
  it('parses a subject with id only', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: minimalAchievement
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a subject with identifier[] only', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      type: ['AchievementSubject'],
      achievement: minimalAchievement,
      identifier: [
        {
          type: ['IdentityObject'],
          identityHash: 'sha256$abc',
          identityType: 'emailAddress'
        }
      ]
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a subject with both id and identifier[]', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: minimalAchievement,
      identifier: [{ type: ['IdentityObject'] }]
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a subject with neither id nor identifier[]', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      type: ['AchievementSubject'],
      achievement: minimalAchievement
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const xorIssue = parsed.error.issues.find(i =>
        i.message.includes('id or non-empty identifier[]')
      );
      expect(xorIssue, 'expected the at-least-one issue').toBeDefined();
      expect(xorIssue?.path).toEqual([]);
    }
  });

  it('rejects a subject with empty identifier[] and no id', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      type: ['AchievementSubject'],
      achievement: minimalAchievement,
      identifier: []
    });
    expect(parsed.success).toBe(false);
  });

  it('normalizes a string-form image on the subject', () => {
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: minimalAchievement,
      image: 'https://example.test/recipient.png'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.image).toEqual({
        id: 'https://example.test/recipient.png',
        type: 'Image'
      });
    }
  });

  it('passes result[] entries through unchanged (Phase 7 backfills)', () => {
    const opaqueResult = {
      type: ['Result'],
      value: '95',
      arbitraryFutureField: { foo: 1 }
    };
    const parsed = Obv3p0AchievementSubjectSchema.safeParse({
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: minimalAchievement,
      result: [opaqueResult]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.result?.[0]).toEqual(opaqueResult);
    }
  });
});

describe('credentialSubject (backfilled into envelope)', () => {
  it('round-trips the spec-conforming fixture', () => {
    const result = parseObv3p0OpenBadgeCredential(
      obv3p0OpenBadgeSpecConforming
    );
    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        credentialSubject: {
          id: string;
          type: string[];
          achievement: { id: string; name: string };
        };
      };
      expect(normalized.credentialSubject.id).toBe('did:example:recipient');
      expect(normalized.credentialSubject.type).toEqual(['AchievementSubject']);
      expect(normalized.credentialSubject.achievement.name).toBe(
        'Example Course'
      );
    }
  });

  it('reports the at-least-one violation at /credentialSubject', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.credentialSubject = {
      type: ['AchievementSubject'],
      achievement: minimalAchievement
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/credentialSubject');
    if (result.status === 'malformed') {
      const xor = result.problems.find(p =>
        p.detail.includes('id or non-empty identifier[]')
      );
      expect(xor).toBeDefined();
    }
  });

  it('reports a missing subject type at /credentialSubject/type', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.credentialSubject = {
      id: 'did:example:recipient',
      achievement: minimalAchievement
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/credentialSubject/type');
  });

  it('reports a missing nested achievement.name at /credentialSubject/achievement/name', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    const { name: _drop, ...achievementWithoutName } = minimalAchievement;
    cred.credentialSubject = {
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: achievementWithoutName
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/credentialSubject/achievement/name');
  });

  it('reports a malformed nested alignment[1] entry deep inside the achievement', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.credentialSubject = {
      id: 'did:example:recipient',
      type: ['AchievementSubject'],
      achievement: {
        ...minimalAchievement,
        alignment: [
          {
            type: ['Alignment'],
            targetName: 'Skill A',
            targetUrl: 'https://example.test/a'
          },
          {
            type: ['Alignment'],
            targetName: 'Skill B'
          }
        ]
      }
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(
      result,
      '/credentialSubject/achievement/alignment/1/targetUrl'
    );
  });
});
