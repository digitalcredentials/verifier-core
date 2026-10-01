import { describe, it, expect } from 'vitest';
import { RealTimeService } from '../../../src/services/time-service/real-time-service.js';
import { FakeTimeService } from '../../../src/services/time-service/fake-time-service.js';

describe('TimeService', () => {
  describe('RealTimeService', () => {
    it('dateNowMs returns within a small epsilon of Date.now()', () => {
      const svc = RealTimeService();
      const before = Date.now();
      const sample = svc.dateNowMs();
      const after = Date.now();
      expect(sample).toBeGreaterThanOrEqual(before);
      expect(sample).toBeLessThanOrEqual(after);
    });

    it('performanceNowMs returns a finite, non-negative number', () => {
      const svc = RealTimeService();
      const sample = svc.performanceNowMs();
      expect(Number.isFinite(sample)).toBe(true);
      expect(sample).toBeGreaterThanOrEqual(0);
    });

    it('performanceNowMs is non-decreasing across consecutive calls', () => {
      const svc = RealTimeService();
      const a = svc.performanceNowMs();
      const b = svc.performanceNowMs();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  describe('FakeTimeService', () => {
    describe('dateNowMs', () => {
      it('returns base + N where N is the per-call counter', () => {
        const base = new Date('2026-01-01T00:00:00Z').getTime();
        const svc = FakeTimeService();
        expect(svc.dateNowMs()).toBe(base + 1);
        expect(svc.dateNowMs()).toBe(base + 2);
        expect(svc.dateNowMs()).toBe(base + 3);
      });

      it('honors a custom baseDateMs seed', () => {
        const base = new Date('2030-06-15T12:00:00Z').getTime();
        const svc = FakeTimeService({ baseDateMs: base });
        expect(svc.dateNowMs()).toBe(base + 1);
        expect(svc.dateNowMs()).toBe(base + 2);
      });

      it('strictly increases across consecutive calls', () => {
        const svc = FakeTimeService();
        const samples = [
          svc.dateNowMs(),
          svc.dateNowMs(),
          svc.dateNowMs(),
          svc.dateNowMs()
        ];
        for (let i = 1; i < samples.length; i++) {
          expect(samples[i]).toBeGreaterThan(samples[i - 1]);
        }
      });
    });

    describe('performanceNowMs', () => {
      it('returns 0, tick, 2*tick, ... with the default tick', () => {
        const svc = FakeTimeService();
        expect(svc.performanceNowMs()).toBe(0);
        expect(svc.performanceNowMs()).toBe(1);
        expect(svc.performanceNowMs()).toBe(2);
      });

      it('honors a custom performanceTickMs', () => {
        const svc = FakeTimeService({ performanceTickMs: 5 });
        expect(svc.performanceNowMs()).toBe(0);
        expect(svc.performanceNowMs()).toBe(5);
        expect(svc.performanceNowMs()).toBe(10);
      });
    });

    describe('counter independence', () => {
      it('interleaved date/perf reads produce per-channel sequences as if isolated', () => {
        const base = new Date('2026-01-01T00:00:00Z').getTime();
        const svc = FakeTimeService();
        expect(svc.dateNowMs()).toBe(base + 1);
        expect(svc.performanceNowMs()).toBe(0);
        expect(svc.dateNowMs()).toBe(base + 2);
        expect(svc.performanceNowMs()).toBe(1);
        expect(svc.performanceNowMs()).toBe(2);
        expect(svc.dateNowMs()).toBe(base + 3);
      });
    });

    describe('isolation', () => {
      it('separate instances have independent counters', () => {
        const a = FakeTimeService();
        const b = FakeTimeService();
        a.dateNowMs();
        a.dateNowMs();
        a.performanceNowMs();
        const base = new Date('2026-01-01T00:00:00Z').getTime();
        expect(b.dateNowMs()).toBe(base + 1);
        expect(b.performanceNowMs()).toBe(0);
      });
    });
  });
});
