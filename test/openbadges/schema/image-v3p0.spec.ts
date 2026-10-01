/**
 * Spec for the Phase-3 OB 3.0 `Image` class schema and the
 * `ImageField()` builder, plus its backfill into the top-level
 * credential `image` slot.
 *
 * Asserts the contract documented in
 * `docs/plans/2026-04-18-openbadges-recognizer-and-subchecks/03-image.md`.
 */

import { describe, it, expect } from 'vitest';
import { Obv3p0ImageSchema } from '../../../src/openbadges/schemas/classes-v3p0.js';
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

describe('Obv3p0ImageSchema (standalone)', () => {
  it('parses a valid Image object with caption', () => {
    const parsed = Obv3p0ImageSchema.safeParse({
      id: 'https://example.test/badge.png',
      type: ['Image'],
      caption: 'A badge'
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('https://example.test/badge.png');
      expect(parsed.data.type).toEqual(['Image']);
      expect(parsed.data.caption).toBe('A badge');
    }
  });

  it('leaves a string type as a string', () => {
    const parsed = Obv3p0ImageSchema.safeParse({
      id: 'https://example.test/badge.png',
      type: 'Image'
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('Image');
    }
  });

  it('rejects an Image whose type is wrong', () => {
    const parsed = Obv3p0ImageSchema.safeParse({
      id: 'https://example.test/badge.png',
      type: ['Profile']
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an Image whose id is not an IRI', () => {
    const parsed = Obv3p0ImageSchema.safeParse({
      id: 'not-an-iri',
      type: ['Image']
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts a data: URI as id', () => {
    const parsed = Obv3p0ImageSchema.safeParse({
      id: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=',
      type: ['Image']
    });

    expect(parsed.success).toBe(true);
  });
});

describe('credential.image (backfilled ImageField)', () => {
  it('round-trips an object-form image on the spec-conforming fixture', () => {
    const result = parseObv3p0OpenBadgeCredential(
      obv3p0OpenBadgeSpecConforming
    );

    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        image: { id: string; type: string | string[]; caption?: string };
      };
      expect(normalized.image).toMatchObject({
        id: 'https://example.test/badge.png',
        caption: 'Spec-conforming badge image'
      });
      expect(normalized.image.type).toEqual(['Image']);
    }
  });

  it("normalizes a string-form image to { id, type: 'Image' }", () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.image = 'https://example.test/string-form.png';

    const result = parseObv3p0OpenBadgeCredential(cred);

    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        image: { id: string; type: string | string[] };
      };
      expect(normalized.image).toEqual({
        id: 'https://example.test/string-form.png',
        type: 'Image'
      });
    }
  });

  it('accepts an absent image (image is optional)', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    delete cred.image;

    const result = parseObv3p0OpenBadgeCredential(cred);
    expect(result.status).toBe('recognized');
  });

  it('rejects an image object with the wrong type', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.image = {
      id: 'https://example.test/badge.png',
      type: ['Profile']
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/image/type');
  });

  it('rejects an image object with a non-IRI id', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.image = { id: 'not-an-iri', type: ['Image'] };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/image/id');
  });
});
