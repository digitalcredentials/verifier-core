/**
 * End-to-end acceptance test for timing instrumentation.
 *
 * Exercises the realistic call shape — `createVerifier({
 * timing: true })` (default `RealTimeService`) verifying a
 * presentation containing embedded credentials — and asserts
 * the inclusive-rollup invariants documented in
 * `docs/api/timing.md`. Acts as the regression gate that
 * timing flows correctly through the default service stack.
 *
 * Per-component / deterministic coverage lives in
 * `timing-instrumentation.spec.ts`; this file deliberately
 * keeps assertions to the integration-level invariants.
 */

import { describe, it, expect } from 'vitest';
import { createVerifier } from '../src/verifier.js';
import { CredentialFactory } from './factories/data/credential-factory.js';
import { PresentationFactory } from './factories/data/presentation-factory.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';

describe('timing instrumentation (acceptance)', () => {
  it('happy path: default RealTimeService, timing: true populates every level and rollups hold', async () => {
    const verifier = createVerifier({
      cryptoServices: [FakeCryptoService({ verified: true })],
      timing: true,
      verbose: true
    });
    const presentation = PresentationFactory({
      verifiableCredential: [
        CredentialFactory({ version: 'v1', credential: {} }),
        CredentialFactory({ credential: {} })
      ]
    });

    const result = await verifier.verifyPresentation({ presentation });

    expect(result.timing).toBeDefined();
    expect(result.timing!.startedAt).toBeTypeOf('string');
    expect(result.timing!.endedAt).toBeTypeOf('string');
    expect(result.timing!.durationMs).toBeGreaterThanOrEqual(0);

    expect(result.summary.length).toBeGreaterThan(0);
    for (const s of result.summary) {
      expect(
        s.timing,
        `presentation summary ${s.id} missing timing`
      ).toBeDefined();
    }

    expect(result.credentialResults).toHaveLength(2);
    for (const cr of result.credentialResults) {
      expect(cr.timing, 'credential result missing timing').toBeDefined();
      for (const s of cr.summary) {
        expect(
          s.timing,
          `credential summary ${s.id} missing timing`
        ).toBeDefined();
      }
    }

    const allSummaries = [
      ...result.summary,
      ...result.credentialResults.flatMap(cr => cr.summary)
    ];
    const maxSummaryDuration = allSummaries
      .map(s => s.timing?.durationMs ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);

    expect(
      result.timing!.durationMs,
      'top-level timing must inclusively wrap every suite under presentation + credentials'
    ).toBeGreaterThanOrEqual(maxSummaryDuration);

    for (const cr of result.credentialResults) {
      expect(
        result.timing!.durationMs,
        'top-level timing must inclusively wrap every embedded credential'
      ).toBeGreaterThanOrEqual(cr.timing!.durationMs);
    }
  });

  it('default (timing: false): no timing field appears anywhere in the result tree', async () => {
    const verifier = createVerifier({
      cryptoServices: [FakeCryptoService({ verified: true })],
      verbose: true
    });
    const presentation = PresentationFactory({
      verifiableCredential: [CredentialFactory({ credential: {} })]
    });

    const result = await verifier.verifyPresentation({ presentation });

    expect(result.timing).toBe(undefined);
    for (const c of result.presentationResults) {
      expect(c.timing).toBe(undefined);
    }
    for (const s of result.summary) {
      expect(s.timing).toBe(undefined);
    }
    for (const cr of result.credentialResults) {
      expect(cr.timing).toBe(undefined);
      for (const c of cr.results) {
        expect(c.timing).toBe(undefined);
      }
      for (const s of cr.summary) {
        expect(s.timing).toBe(undefined);
      }
    }
  });
});
