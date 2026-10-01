/**
 * Spec for the Phase-5 OB 3.0 `Alignment` (§B.1.5) and
 * `Achievement` (§B.1.1) class schemas.
 *
 * Achievement is not yet wired into `AchievementSubject` (Phase 6
 * does that). These schemas are tested standalone via
 * `safeParse`. Path-based `instance` assertions verify that
 * malformed nested entries (e.g. `alignment[1]`) carry accurate
 * JSON Pointers when run through Zod.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  Obv3p0AchievementSchema,
  Obv3p0AlignmentSchema
} from '../../../src/openbadges/schemas/classes-v3p0.js';

function pathOf(error: z.ZodError): string[] {
  return error.issues.map(i => i.path.join('.'));
}

describe('Obv3p0AlignmentSchema', () => {
  const minimalAlignment = {
    type: ['Alignment'],
    targetName: 'Frontend Developer',
    targetUrl: 'https://example.test/framework/frontend-dev'
  };

  it('parses an alignment with only required fields', () => {
    const parsed = Obv3p0AlignmentSchema.safeParse(minimalAlignment);
    expect(parsed.success).toBe(true);
  });

  it('round-trips an alignment with all in-scope optionals', () => {
    const parsed = Obv3p0AlignmentSchema.safeParse({
      ...minimalAlignment,
      targetCode: 'FE-100',
      targetDescription: 'Frontend dev competency',
      targetFramework: 'Example Skills Framework',
      targetType: 'ceasn:Competency'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.targetCode).toBe('FE-100');
      expect(parsed.data.targetType).toBe('ceasn:Competency');
    }
  });

  it('rejects an alignment missing targetName', () => {
    const { targetName: _drop, ...rest } = minimalAlignment;
    const parsed = Obv3p0AlignmentSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('targetName');
    }
  });

  it('rejects an alignment missing targetUrl', () => {
    const { targetUrl: _drop, ...rest } = minimalAlignment;
    const parsed = Obv3p0AlignmentSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('targetUrl');
    }
  });

  it('rejects an alignment whose targetUrl is not a URL', () => {
    const parsed = Obv3p0AlignmentSchema.safeParse({
      ...minimalAlignment,
      targetUrl: 'not-a-url'
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('targetUrl');
    }
  });

  it("rejects an alignment whose type doesn't include 'Alignment'", () => {
    const parsed = Obv3p0AlignmentSchema.safeParse({
      ...minimalAlignment,
      type: ['SomethingElse']
    });
    expect(parsed.success).toBe(false);
  });
});

describe('Obv3p0AchievementSchema', () => {
  const minimalAchievement = {
    id: 'https://example.test/achievements/1',
    type: ['Achievement'],
    criteria: {
      narrative: 'Completed all required modules.'
    },
    description: 'Achievement description.',
    name: 'Example Achievement'
  };

  it('parses an achievement with only required fields', () => {
    const parsed = Obv3p0AchievementSchema.safeParse(minimalAchievement);
    expect(parsed.success).toBe(true);
  });

  it('accepts an empty criteria object (both id and narrative optional)', () => {
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      criteria: {}
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an achievement missing criteria', () => {
    const { criteria: _drop, ...rest } = minimalAchievement;
    const parsed = Obv3p0AchievementSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('criteria');
    }
  });

  it('rejects an achievement missing description', () => {
    const { description: _drop, ...rest } = minimalAchievement;
    const parsed = Obv3p0AchievementSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('description');
    }
  });

  it('rejects an achievement missing name', () => {
    const { name: _drop, ...rest } = minimalAchievement;
    const parsed = Obv3p0AchievementSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(pathOf(parsed.error)).toContain('name');
    }
  });

  it('normalizes a string-form creator to { id, type: ["Profile"] }', () => {
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      creator: 'did:example:creator'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creator).toEqual({
        id: 'did:example:creator',
        type: ['Profile']
      });
    }
  });

  it('round-trips a full Profile creator', () => {
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      creator: {
        id: 'did:example:creator',
        type: ['Profile'],
        name: 'Achievement Creator'
      }
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creator).toMatchObject({
        id: 'did:example:creator',
        name: 'Achievement Creator'
      });
    }
  });

  it('normalizes a string-form image', () => {
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      image: 'https://example.test/badge.png'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.image).toEqual({
        id: 'https://example.test/badge.png',
        type: 'Image'
      });
    }
  });

  it('reports per-entry path for a malformed alignment[1]', () => {
    const goodAlignment = {
      type: ['Alignment'],
      targetName: 'Skill A',
      targetUrl: 'https://example.test/a'
    };
    const badAlignment = {
      type: ['Alignment'],
      targetName: 'Skill B'
    };
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      alignment: [goodAlignment, badAlignment]
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const targetUrlIssue = parsed.error.issues.find(
        i => i.path.join('.') === 'alignment.1.targetUrl'
      );
      expect(
        targetUrlIssue,
        `expected an issue at alignment.1.targetUrl, got ${JSON.stringify(
          pathOf(parsed.error)
        )}`
      ).toBeDefined();
    }
  });

  it('validates resultDescription[] entries and preserves passthrough fields', () => {
    const validResultDescription = {
      id: 'urn:result-desc:1',
      type: ['ResultDescription'],
      name: 'Score',
      resultType: 'LetterGrade',
      arbitraryFutureField: { foo: 1 }
    };
    const parsed = Obv3p0AchievementSchema.safeParse({
      ...minimalAchievement,
      resultDescription: [validResultDescription]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.resultDescription?.[0]).toMatchObject({
        id: 'urn:result-desc:1',
        name: 'Score',
        resultType: 'LetterGrade'
      });
      const entry = parsed.data.resultDescription?.[0] as unknown as {
        arbitraryFutureField: { foo: number };
      };
      expect(entry.arbitraryFutureField.foo).toBe(1);
    }
  });
});
