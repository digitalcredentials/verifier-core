/**
 * Suite orchestration engine.
 *
 * `runSuites` is the core loop of the verification pipeline: it iterates
 * suites in order, applies any per-suite `applies` predicate, runs each
 * check, respects `appliesTo` filtering and `fatal` short-circuiting,
 * and returns a flat `CheckResult[]` report.
 *
 * Invariants:
 * - The first fatal failure halts the subject: no later check executes,
 *   in the same suite or any later one. Each check that would have run is
 *   reported as a `'skipped'` row with reason
 *   `Not run: <check-id> failed`, so the report still lists it.
 * - A throw never escapes. A throwing `execute` or `applies` becomes a
 *   `failure` result carrying {@link ProblemTypes.CHECK_ERROR}, so
 *   `runSuites` always resolves.
 *
 * This module is pure orchestration — it has no knowledge of what any
 * check actually does.
 */

import {
  VerificationSuite,
  VerificationCheck,
  CheckResult,
  CheckOutcome,
  SuitePhase
} from './types/check.js';
import { VerificationContext } from './types/context.js';
import { ProblemTypes } from './problem-types.js';
import { VerificationSubject } from './types/subject.js';
import type { TimeService } from './services/time-service/time-service.js';
import type { TaskTiming } from './types/timing.js';

/** Reason prefix on the `'skipped'` rows emitted for checks halted by an earlier fatal failure. */
export const NOT_RUN_REASON_PREFIX = 'Not run: ';

/**
 * Optional orchestration knobs.
 *
 * - `explicitSuiteIds`: ids of suites the consumer queued
 *   themselves (typically via `additionalSuites`). When a suite's
 *   `applies` predicate returns false, suites in this set still
 *   surface a synthetic `<suite-id>.applies` `'skipped'`
 *   `CheckResult` so the consumer sees their explicit request was
 *   dropped. Suites not in this set silently skip.
 * - `phases`: when set, only suites whose `phase` matches one of
 *   the requested phases run. Untagged suites bypass the filter
 *   (run in every phase request); this is intentional so consumer
 *   suites added via `additionalSuites` without a phase tag still
 *   execute regardless of the filter. The `recognition` auto-include
 *   when `'semantic'` is requested is the verifier-layer's
 *   responsibility, not this function's — pass an already-expanded
 *   list.
 */
export interface RunSuitesOptions {
  explicitSuiteIds?: ReadonlySet<string>;
  phases?: SuitePhase[];
}

/**
 * Whether a suite is permitted to run under the current
 * phase filter. See {@link RunSuitesOptions.phases}.
 */
function suiteRunsInPhases(
  suite: VerificationSuite,
  phases: SuitePhase[] | undefined
): boolean {
  if (phases === undefined) {
    return true;
  }
  if (suite.phase === undefined) {
    return true;
  }
  return phases.includes(suite.phase);
}

/**
 * Check if a verification check applies to the given subject.
 * If check.appliesTo is defined, the subject must have at least one
 * of the specified properties (verifiableCredential or verifiablePresentation).
 */
function appliesToSubject(
  check: VerificationCheck,
  subject: VerificationSubject
): boolean {
  if (!check.appliesTo || check.appliesTo.length === 0) {
    return true; // No restriction = applies to everything
  }

  return check.appliesTo.some(prop => {
    if (prop === 'verifiableCredential') {
      return subject.verifiableCredential !== undefined;
    }
    if (prop === 'verifiablePresentation') {
      return subject.verifiablePresentation !== undefined;
    }
    return false;
  });
}

/**
 * Run a list of verification suites sequentially against a subject.
 *
 * - Suites whose `phase` is excluded by `options.phases` are
 *   silently skipped (no synthetic result emitted, even when the
 *   suite is in `explicitSuiteIds` — the consumer asked for a
 *   subset and will see only that subset). Untagged suites bypass
 *   the phase filter.
 * - Suites with an `applies` predicate that returns false are
 *   silently skipped, except when their id appears in
 *   `options.explicitSuiteIds` — in which case a synthetic
 *   `<suite-id>.applies` `'skipped'` `CheckResult` is emitted.
 * - A throwing `applies` predicate becomes a `<suite-id>.applies`
 *   `failure` carrying `CHECK_ERROR`, and that suite's checks do not
 *   run. The row is fatal when the suite has any fatal check (a suite
 *   that could have failed the subject must not silently pass).
 * - Checks are executed in order within each suite.
 * - Checks with `appliesTo` restrictions are skipped if they don't match the subject.
 * - A throwing check becomes a `failure` carrying `CHECK_ERROR`, and
 *   keeps the check's own `fatal` flag.
 * - A fatal failure halts every remaining check for the subject, in
 *   this suite and all later suites. Each check that would have run is
 *   reported as `'skipped'` with reason `Not run: <check-id> failed`.
 *   Phase filtering and `applies` are still evaluated after a halt, so
 *   suites that would not have run stay silent.
 * - Returns a flat array of all check results.
 */
export async function runSuites(
  suites: VerificationSuite[],
  subject: VerificationSubject,
  context: VerificationContext,
  options: RunSuitesOptions = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const timing = context.timing === true;
  const timeService = context.timeService;
  /** Local id of the first fatal failure; once set, no check executes. */
  let haltedBy: string | undefined;

  for (const suite of suites) {
    if (!suiteRunsInPhases(suite, options.phases)) {
      continue;
    }

    let applies = true;
    if (suite.applies) {
      try {
        applies = suite.applies(subject, context);
      } catch (error) {
        const fatal = suite.checks.some(c => c.fatal === true);
        results.push(
          buildAppliesErrorResult(suite.id, error, fatal, timing, timeService)
        );
        if (fatal && haltedBy === undefined) {
          haltedBy = `${suite.id}.applies`;
        }
        continue;
      }
    }

    if (!applies) {
      if (options.explicitSuiteIds?.has(suite.id)) {
        results.push(
          buildSyntheticAppliesSkipResult(suite.id, timing, timeService)
        );
      }
      continue;
    }

    for (const check of suite.checks) {
      if (check.appliesTo && !appliesToSubject(check, subject)) {
        continue;
      }

      if (haltedBy !== undefined) {
        results.push(
          buildNotRunResult(suite.id, check, haltedBy, timing, timeService)
        );
        continue;
      }

      const taskTiming = timing ? startTaskTiming(timeService) : undefined;
      let outcome: CheckOutcome;
      try {
        outcome = await check.execute(subject, context);
      } catch (error) {
        outcome = buildCheckErrorOutcome(check.id, error);
      }
      const finishedTiming = taskTiming
        ? finishTaskTiming(taskTiming, timeService)
        : undefined;

      const result: CheckResult = {
        check: check.id,
        suite: suite.id,
        outcome,
        fatal: check.fatal
      };
      if (finishedTiming !== undefined) {
        result.timing = finishedTiming;
      }
      results.push(result);

      if (check.fatal && outcome.status === 'failure') {
        haltedBy = check.id;
      }
    }
  }

  return results;
}

/**
 * Internal: turn a throw from `check.execute` into a `failure`
 * outcome carrying {@link ProblemTypes.CHECK_ERROR}. Only the
 * message is kept — never the stack.
 */
function buildCheckErrorOutcome(id: string, error: unknown): CheckOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'failure',
    problems: [
      {
        type: ProblemTypes.CHECK_ERROR,
        title: 'Check Error',
        detail: `Check "${id}" threw: ${message}`
      }
    ]
  };
}

/**
 * Internal: build the `<suite-id>.applies` failure emitted when a
 * suite's `applies` predicate throws. Timed as an instantaneous
 * decision, like {@link buildSyntheticAppliesSkipResult}.
 */
function buildAppliesErrorResult(
  suiteId: string,
  error: unknown,
  fatal: boolean,
  timing: boolean,
  timeService: TimeService | undefined
): CheckResult {
  const checkId = `${suiteId}.applies`;
  const result: CheckResult = {
    check: checkId,
    suite: suiteId,
    outcome: buildCheckErrorOutcome(checkId, error),
    fatal
  };
  return withInstantTiming(result, timing, timeService);
}

/**
 * Internal: build the `'skipped'` row for a check that would have
 * run but did not, because `haltedBy` failed fatally earlier for
 * this subject. Timed as an instantaneous decision, like
 * {@link buildSyntheticAppliesSkipResult}.
 */
function buildNotRunResult(
  suiteId: string,
  check: VerificationCheck,
  haltedBy: string,
  timing: boolean,
  timeService: TimeService | undefined
): CheckResult {
  const result: CheckResult = {
    check: check.id,
    suite: suiteId,
    outcome: {
      status: 'skipped',
      reason: `${NOT_RUN_REASON_PREFIX}${haltedBy} failed`
    },
    fatal: check.fatal
  };
  return withInstantTiming(result, timing, timeService);
}

/**
 * Internal: build the synthetic `<suite-id>.applies` skipped
 * result, instrumenting `timing` when requested. The synthetic
 * row represents an instantaneous decision (the `applies`
 * predicate was already evaluated), so its timing window
 * collapses to a single sample of each clock — `endedAt` and
 * `durationMs` reflect the cost of recording the decision, not
 * the predicate itself.
 */
function buildSyntheticAppliesSkipResult(
  suiteId: string,
  timing: boolean,
  timeService: TimeService | undefined
): CheckResult {
  const result: CheckResult = {
    check: `${suiteId}.applies`,
    suite: suiteId,
    outcome: {
      status: 'skipped',
      reason: 'suite predicate returned false'
    }
  };
  return withInstantTiming(result, timing, timeService);
}

/**
 * Internal: attach a collapsed timing window to a synthetic row
 * when `timing` is on. The window samples each clock once, so
 * suite rollups keep summing cleanly over synthetic rows.
 */
function withInstantTiming(
  result: CheckResult,
  timing: boolean,
  timeService: TimeService | undefined
): CheckResult {
  if (timing) {
    const started = startTaskTiming(timeService);
    result.timing = finishTaskTiming(started, timeService);
  }
  return result;
}

interface InProgressTiming {
  startedAt: string;
  startedMonoMs: number;
}

/**
 * Sample wall-clock + monotonic clock at task start. Both
 * samples flow through the injected {@link TimeService} so
 * tests can pin them via `FakeTimeService`. Falls back to
 * `Date` / `performance` only as a defensive guard for code
 * paths that built a {@link VerificationContext} directly
 * without setting `timeService`; production callers set it
 * via `createVerifier(...)`.
 */
function startTaskTiming(
  timeService: TimeService | undefined
): InProgressTiming {
  const dateNowMs = timeService ? timeService.dateNowMs() : Date.now();
  const startedMonoMs = timeService
    ? timeService.performanceNowMs()
    : performance.now();
  return {
    startedAt: new Date(dateNowMs).toISOString(),
    startedMonoMs
  };
}

/**
 * Close out an {@link InProgressTiming} by sampling both
 * clocks again. `durationMs` comes from the monotonic clock
 * (immune to wall-clock jumps); `startedAt` / `endedAt` come
 * from the wall-clock for log correlation.
 */
function finishTaskTiming(
  started: InProgressTiming,
  timeService: TimeService | undefined
): TaskTiming {
  const endDateMs = timeService ? timeService.dateNowMs() : Date.now();
  const endMonoMs = timeService
    ? timeService.performanceNowMs()
    : performance.now();
  return {
    startedAt: started.startedAt,
    endedAt: new Date(endDateMs).toISOString(),
    durationMs: endMonoMs - started.startedMonoMs
  };
}
