/**
 * Spec for the Phase-4 OB 3.0 `Profile` class schema and the
 * `ProfileRefField()` builder, plus its backfill into
 * `credential.issuer`.
 *
 * Asserts the contract documented in
 * `docs/plans/2026-04-18-openbadges-recognizer-and-subchecks/04-profile-and-profileref.md`.
 */

import { describe, it, expect } from 'vitest';
import { Obv3p0ProfileSchema } from '../../../src/openbadges/schemas/classes-v3p0.js';
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

describe('Obv3p0ProfileSchema (standalone)', () => {
  it('parses a Profile with all in-scope optionals', () => {
    const parsed = Obv3p0ProfileSchema.safeParse({
      id: 'did:example:issuer',
      type: ['Profile'],
      name: 'Example Issuer',
      url: 'https://example.test/about',
      description: 'A trustworthy badge issuer.',
      image: 'https://example.test/logo.png',
      email: 'issuer@example.test'
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Example Issuer');
      expect(parsed.data.email).toBe('issuer@example.test');
      expect(parsed.data.image).toMatchObject({
        id: 'https://example.test/logo.png'
      });
    }
  });

  it('rejects a Profile missing id', () => {
    const parsed = Obv3p0ProfileSchema.safeParse({ type: ['Profile'] });
    expect(parsed.success).toBe(false);
  });

  it('rejects a Profile missing type', () => {
    const parsed = Obv3p0ProfileSchema.safeParse({
      id: 'did:example:issuer'
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an email that doesn't contain '@'", () => {
    const parsed = Obv3p0ProfileSchema.safeParse({
      id: 'did:example:issuer',
      type: ['Profile'],
      email: 'not-an-email'
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const emailIssue = parsed.error.issues.find(
        i => i.path.join('.') === 'email'
      );
      expect(emailIssue?.message).toMatch(/@/);
    }
  });

  it('passes through unknown / out-of-scope fields like parentOrg', () => {
    const parsed = Obv3p0ProfileSchema.safeParse({
      id: 'did:example:issuer',
      type: ['Profile'],
      parentOrg: 'https://example.test/parent',
      arbitraryExtension: { foo: 1 }
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const data = parsed.data as unknown as {
        parentOrg: string;
        arbitraryExtension: { foo: number };
      };
      expect(data.parentOrg).toBe('https://example.test/parent');
      expect(data.arbitraryExtension.foo).toBe(1);
    }
  });

  it('accepts a did: id (rejects only non-IRI strings)', () => {
    const parsed = Obv3p0ProfileSchema.safeParse({
      id: 'did:web:issuer.example.test',
      type: ['Profile']
    });
    expect(parsed.success).toBe(true);
  });
});

describe('credential.issuer (backfilled ProfileRefField)', () => {
  it('round-trips an object-form issuer on the spec-conforming fixture', () => {
    const result = parseObv3p0OpenBadgeCredential(
      obv3p0OpenBadgeSpecConforming
    );

    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        issuer: { id: string; type: string[]; name?: string };
      };
      expect(normalized.issuer.id).toBe('did:example:issuer');
      expect(normalized.issuer.type).toEqual(['Profile']);
      expect(normalized.issuer.name).toBe('Spec-Conforming Issuer');
    }
  });

  it('normalizes a string-form issuer to { id, type: ["Profile"] }', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.issuer = 'did:example:string-issuer';

    const result = parseObv3p0OpenBadgeCredential(cred);

    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        issuer: { id: string; type: string[] };
      };
      expect(normalized.issuer).toEqual({
        id: 'did:example:string-issuer',
        type: ['Profile']
      });
    }
  });

  it('rejects an issuer object missing type', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.issuer = { id: 'did:example:issuer' };

    const result = parseObv3p0OpenBadgeCredential(cred);
    // Zod surfaces the failure at the union's parent path (`/issuer`)
    // when neither branch advances past structural matching — the
    // string-IRI branch is rejected immediately (input is an object)
    // and the Profile branch fails at the missing required `type`.
    // This matches the plan's "appropriate parent path" allowance.
    assertMalformedAt(result, '/issuer');
  });

  it('rejects an issuer object with a malformed email', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.issuer = {
      id: 'did:example:issuer',
      type: ['Profile'],
      email: 'no-at-symbol'
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    assertMalformedAt(result, '/issuer/email');
  });

  it('preserves passthrough fields on the issuer (parentOrg)', () => {
    const cred = clone(obv3p0OpenBadgeSpecConforming);
    cred.issuer = {
      id: 'did:example:issuer',
      type: ['Profile'],
      parentOrg: 'https://example.test/parent'
    };

    const result = parseObv3p0OpenBadgeCredential(cred);
    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      const normalized = result.normalized as {
        issuer: { parentOrg: string };
      };
      expect(normalized.issuer.parentOrg).toBe('https://example.test/parent');
    }
  });
});
