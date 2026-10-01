import type { TimeService } from './time-service.js';

/**
 * Production {@link TimeService} backed by `Date.now()` and
 * `performance.now()`. The default service used by
 * `createVerifier(...)` when no `timeService` override is
 * supplied on `VerifierConfig`.
 */
export function RealTimeService(): TimeService {
  return {
    dateNowMs: () => Date.now(),
    performanceNowMs: () => performance.now()
  };
}
