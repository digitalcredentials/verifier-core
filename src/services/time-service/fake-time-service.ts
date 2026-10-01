import type { TimeService } from './time-service.js';

/**
 * Fully deterministic {@link TimeService} for tests.
 *
 * Both clocks advance via independent monotonic counters, so
 * every `TaskTiming` field captured during a test run is
 * exact-value-assertable.
 *
 *  - `dateNowMs()` returns `baseDateMs + n` where `n` is the
 *    1-based per-call counter for the wall-clock channel.
 *    Strictly increasing; preserves ordering across calls.
 *  - `performanceNowMs()` returns `n * performanceTickMs`
 *    where `n` is the 0-based per-call counter for the
 *    performance channel (so the first call returns 0).
 *    Default `performanceTickMs` is 1, so two consecutive
 *    reads produce a `durationMs` of exactly 1.
 *
 * Two independent counters (rather than one shared) so
 * wall-clock and performance reads can interleave without
 * skewing each other's expected values in tests.
 *
 * Diverges from the skills-verifier `FakeTimeService` (which
 * passes `performanceNowMs()` through to real
 * `performance.now()`) on purpose: verifier-core uses
 * `performanceNowMs()` to populate `TaskTiming.durationMs`,
 * and shape-only duration assertions are a poor substitute
 * for the deterministic exact-value assertions consumers
 * actually want when verifying timing rollup math.
 */
export function FakeTimeService(
  opts: {
    baseDateMs?: number;
    performanceTickMs?: number;
  } = {}
): TimeService {
  const base = opts.baseDateMs ?? new Date('2026-01-01T00:00:00Z').getTime();
  const tick = opts.performanceTickMs ?? 1;
  let dateCalls = 0;
  let perfCalls = 0;
  return {
    dateNowMs: () => base + ++dateCalls,
    performanceNowMs: () => perfCalls++ * tick
  };
}
