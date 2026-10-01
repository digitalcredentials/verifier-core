/**
 * Timing data captured for a single verification "task" — a
 * check, a suite, or a top-level verifier call.
 *
 * Only present on a result when the producing call ran with
 * `timing: true` (on `VerifierConfig` or per-call). When set,
 * carries:
 *
 *  - `startedAt` / `endedAt` — wall-clock ISO 8601 strings.
 *    Sourced from `TimeService.dateNowMs()` so tests can pin
 *    them via `FakeTimeService`. Useful for log correlation.
 *  - `durationMs` — monotonic high-resolution duration from
 *    `TimeService.performanceNowMs()`. The only correct field
 *    to sort / sum / compare for performance work.
 *  - `events` — reserved for an ordered series of sub-events
 *    captured from inside one task (e.g. `signature.verify`,
 *    `documentLoader.load`, `statusList.fetch`). No built-in
 *    capture writes to this field today; a future plan may
 *    add a hook on `VerificationContext` for checks to push
 *    sub-events. Recursive so a sub-event can have its own
 *    sub-events.
 *
 * @see ../../docs/api/timing.md for usage patterns.
 */
export interface TaskTiming {
  /** ISO 8601 wall-clock at task start. */
  startedAt: string;
  /** ISO 8601 wall-clock at task end (>= `startedAt`). */
  endedAt: string;
  /** Monotonic duration in fractional ms (>= 0). */
  durationMs: number;
  /**
   * Optional ordered sub-events captured from inside this
   * task. Empty / omitted in the current release; reserved
   * for future sub-event capture.
   */
  events?: ReadonlyArray<TaskTiming & { name: string }>;
}
