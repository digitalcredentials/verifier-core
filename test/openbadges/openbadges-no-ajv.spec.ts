/**
 * Pins that `@digitalcredentials/verifier-core/openbadges` loads no AJV
 * (and so none of the bundled JSON Schemas, which only the AJV-carrying
 * modules import).
 *
 * Every AJV entry point is mocked to throw when loaded, so any import
 * chain that reaches one rejects. A module-graph assertion is less
 * brittle than inspecting `dist/` or bundle output, and the second case
 * proves the mock does fire. This lives in its own file because
 * `vi.mock` applies to every import in the file.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('ajv/dist/2020.js', () => {
  throw new Error('ajv loaded');
});
vi.mock('ajv', () => {
  throw new Error('ajv loaded');
});
vi.mock('ajv-formats', () => {
  throw new Error('ajv-formats loaded');
});

describe('/openbadges without AJV', () => {
  it('imports the /openbadges barrel without loading AJV', async () => {
    const mod = await import('../../src/openbadges/index.js');
    expect(mod.openBadgesSemanticSuite.id).toBe('openbadges.semantic');
  });

  it('fails to import /openbadges/schema, which does load AJV', async () => {
    // Vitest wraps a throwing mock factory's error; ours is the cause.
    const error = await import('../../src/openbadges/schema/index.js').then(
      () => undefined,
      (e: unknown) => e
    );
    expect((error as Error | undefined)?.cause).toEqual(
      expect.objectContaining({ message: expect.stringMatching(/loaded$/) })
    );
  });
});
