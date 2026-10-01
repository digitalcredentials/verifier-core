/**
 * Deterministic coverage for the `timing` flag.
 *
 * Uses {@link FakeTimeService} so every `TaskTiming` field is
 * exact-value-assertable: counter-based wall clock for
 * `startedAt` / `endedAt` and counter-based monotonic clock
 * for `durationMs`. Higher-level presence/absence coverage
 * lives in `test/verify-credential.spec.ts` and
 * `test/verify-presentation.spec.ts`.
 */

import { describe, it, expect } from 'vitest';
import { createVerifier } from '../src/verifier.js';
import { FakeTimeService } from '../src/services/time-service/fake-time-service.js';
import { CredentialFactory } from './factories/data/credential-factory.js';
import { PresentationFactory } from './factories/data/presentation-factory.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';

const BASE_DATE_MS = new Date('2026-01-01T00:00:00Z').getTime();

const fakeVerified = {
  cryptoServices: [FakeCryptoService({ verified: true })],
  verbose: true
};

describe('timing instrumentation', () => {
  describe('CheckResult.timing', () => {
    it('is absent when timing is left at its default (false)', async () => {
      const verifier = createVerifier({ ...fakeVerified });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      expect(result.timing).toBe(undefined);
      for (const c of result.results) {
        expect(c.timing).toBe(undefined);
      }
      for (const s of result.summary) {
        expect(s.timing).toBe(undefined);
      }
    });

    it('is present on every CheckResult when timing: true', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      expect(result.results.length).toBeGreaterThan(0);
      for (const c of result.results) {
        expect(c.timing, `${c.id ?? c.check} missing timing`).toBeDefined();
      }
    });

    it('uses TimeService for wall-clock fields', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService({ baseDateMs: BASE_DATE_MS })
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });

      for (const c of result.results) {
        const startedMs = new Date(c.timing!.startedAt).getTime();
        const endedMs = new Date(c.timing!.endedAt).getTime();
        expect(startedMs - BASE_DATE_MS).toBeGreaterThan(0);
        expect(endedMs - BASE_DATE_MS).toBeGreaterThan(0);
        expect(endedMs).toBeGreaterThanOrEqual(startedMs);
      }
    });

    it('endedAt >= startedAt and ISO-parses for every check', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      for (const c of result.results) {
        const s = new Date(c.timing!.startedAt).getTime();
        const e = new Date(c.timing!.endedAt).getTime();
        expect(Number.isNaN(s), `bad startedAt for ${c.id}`).toBe(false);
        expect(Number.isNaN(e), `bad endedAt for ${c.id}`).toBe(false);
        expect(e).toBeGreaterThanOrEqual(s);
      }
    });

    it('durationMs equals exactly 1 per check with default tick (one perf read each side)', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      for (const c of result.results) {
        expect(c.timing!.durationMs).toBe(1);
      }
    });
  });

  describe('SuiteSummary.timing rollup', () => {
    it('startedAt is the earliest child startedAt; endedAt is the latest', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });

      const childrenBySuite = new Map<string, typeof result.results>();
      for (const c of result.results) {
        const arr = childrenBySuite.get(c.suite) ?? [];
        arr.push(c);
        childrenBySuite.set(c.suite, arr);
      }
      for (const s of result.summary) {
        const children = childrenBySuite.get(s.suite);
        if (!children || children.length === 0) {
          continue;
        }
        expect(s.timing).toBeDefined();
        const minStart = children
          .map(c => c.timing!.startedAt)
          .reduce((a, b) => (a < b ? a : b));
        const maxEnd = children
          .map(c => c.timing!.endedAt)
          .reduce((a, b) => (a > b ? a : b));
        expect(s.timing!.startedAt).toBe(minStart);
        expect(s.timing!.endedAt).toBe(maxEnd);
      }
    });

    it('durationMs equals the sum of child durationMs', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });

      const childrenBySuite = new Map<string, typeof result.results>();
      for (const c of result.results) {
        const arr = childrenBySuite.get(c.suite) ?? [];
        arr.push(c);
        childrenBySuite.set(c.suite, arr);
      }
      for (const s of result.summary) {
        const children = childrenBySuite.get(s.suite) ?? [];
        if (children.length === 0) {
          continue;
        }
        const sum = children.reduce((acc, c) => acc + c.timing!.durationMs, 0);
        expect(s.timing!.durationMs).toBe(sum);
      }
    });

    it('survives non-verbose folding (suite timing present even when results[] is empty)', async () => {
      const verifier = createVerifier({
        cryptoServices: [FakeCryptoService({ verified: true })],
        timing: true,
        timeService: FakeTimeService()
        // verbose: false (default)
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      expect(result.results).toEqual([]);
      expect(result.summary.length).toBeGreaterThan(0);
      for (const s of result.summary) {
        expect(s.timing).toBeDefined();
      }
    });
  });

  describe('top-level result.timing', () => {
    it('is present when timing: true', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      expect(result.timing).toBeDefined();
      const s = new Date(result.timing!.startedAt).getTime();
      const e = new Date(result.timing!.endedAt).getTime();
      expect(e).toBeGreaterThanOrEqual(s);
    });

    it('absent when timing: false (default)', async () => {
      const verifier = createVerifier({ ...fakeVerified });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      expect(result.timing).toBe(undefined);
    });

    it('top-level durationMs >= max suite durationMs (inclusive)', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({ credential });
      const maxSuite = result.summary
        .map(s => s.timing?.durationMs ?? 0)
        .reduce((a, b) => Math.max(a, b), 0);
      expect(result.timing!.durationMs).toBeGreaterThanOrEqual(maxSuite);
    });

    it('verifyPresentation top-level timing >= each embedded credential timing', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const presentation = PresentationFactory({
        verifiableCredential: [
          CredentialFactory({ version: 'v1', credential: {} }),
          CredentialFactory({ credential: {} })
        ]
      });
      const result = await verifier.verifyPresentation({ presentation });
      expect(result.timing).toBeDefined();
      expect(result.credentialResults).toHaveLength(2);
      for (const cr of result.credentialResults) {
        expect(cr.timing).toBeDefined();
        expect(result.timing!.durationMs).toBeGreaterThanOrEqual(
          cr.timing!.durationMs
        );
      }
    });
  });

  describe('parse-failure short-circuit', () => {
    it('emits timing on the synthetic parsing.envelope check when timing: true', async () => {
      const verifier = createVerifier({
        timing: true,
        timeService: FakeTimeService()
      });
      const result = await verifier.verifyCredential({
        credential: 'not a credential'
      });
      expect(result.timing).toBeDefined();
      expect(result.results).toHaveLength(1);
      const only = result.results[0];
      expect(only.suite).toBe('parsing');
      expect(only.timing).toBeDefined();
      expect(only.timing!.durationMs).toBe(1);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0].timing).toBeDefined();
      expect(result.summary[0].timing!.durationMs).toBe(1);
    });

    it('omits timing on parse failure when timing: false', async () => {
      const verifier = createVerifier({});
      const result = await verifier.verifyCredential({
        credential: 'not a credential'
      });
      expect(result.timing).toBe(undefined);
      expect(result.results[0].timing).toBe(undefined);
      expect(result.summary[0].timing).toBe(undefined);
    });
  });

  describe('per-call override of constructor timing', () => {
    it('per-call timing: false overrides constructor timing: true', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({
        credential,
        timing: false
      });
      expect(result.timing).toBe(undefined);
      for (const c of result.results) {
        expect(c.timing).toBe(undefined);
      }
    });

    it('per-call timing: true overrides constructor timing: false', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timeService: FakeTimeService()
      });
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifier.verifyCredential({
        credential,
        timing: true
      });
      expect(result.timing).toBeDefined();
      for (const c of result.results) {
        expect(c.timing).toBeDefined();
      }
    });
  });

  describe('propagation into embedded credential calls', () => {
    it('verifyPresentation propagates per-call timing to embedded verifyCredential', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timeService: FakeTimeService()
      });
      const presentation = PresentationFactory({
        verifiableCredential: [CredentialFactory({ credential: {} })]
      });
      const result = await verifier.verifyPresentation({
        presentation,
        timing: true
      });
      expect(result.timing).toBeDefined();
      for (const cr of result.credentialResults) {
        expect(cr.timing).toBeDefined();
        for (const c of cr.results) {
          expect(c.timing).toBeDefined();
        }
      }
    });

    it('verifyPresentation per-call timing: false suppresses embedded timing even when constructor enabled it', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        timing: true,
        timeService: FakeTimeService()
      });
      const presentation = PresentationFactory({
        verifiableCredential: [CredentialFactory({ credential: {} })]
      });
      const result = await verifier.verifyPresentation({
        presentation,
        timing: false
      });
      expect(result.timing).toBe(undefined);
      for (const cr of result.credentialResults) {
        expect(cr.timing).toBe(undefined);
        for (const c of cr.results) {
          expect(c.timing).toBe(undefined);
        }
      }
    });
  });
});
