/**
 * Pluggable clock for verifier-core.
 *
 * Two methods, two semantics:
 *
 *  - `dateNowMs()` — wall-clock ms since the Unix epoch. Used
 *    for human/log-correlatable timestamps (`startedAt` /
 *    `endedAt` strings on `TaskTiming`) and for any
 *    business-time decision (credential expiration, signature
 *    clock-skew window, key rotation, status-list freshness).
 *    `FakeTimeService` returns deterministic monotonic values.
 *
 *  - `performanceNowMs()` — monotonic high-resolution ms.
 *    The only correct source for measuring durations:
 *    immune to wall-clock jumps (NTP, DST). `FakeTimeService`
 *    also returns deterministic monotonic values here, so
 *    `TaskTiming.durationMs` is exact-value-assertable in
 *    tests.
 *
 * @see {@link RealTimeService} for the production implementation.
 * @see {@link FakeTimeService} for the deterministic test
 *      implementation.
 */
export interface TimeService {
  dateNowMs: () => number;
  performanceNowMs: () => number;
}
