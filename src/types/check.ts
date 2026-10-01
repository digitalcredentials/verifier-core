/**
 * Core verification primitives: suites, checks, and outcomes.
 *
 * These types form the plugin contract for the verification pipeline.
 * Each suite is a named group of checks; each check returns a discriminated
 * outcome (success / failure / skip). The orchestrator in `run-suites.ts`
 * iterates suites and assembles a flat `CheckResult[]` report.
 *
 * @see {@link ../run-suites.ts} for orchestration
 * @see {@link ../defaults.ts} for the default suite ordering
 */

import type { ProblemDetail } from './problem-detail.js';
import type { VerificationSubject } from './subject.js';
import type { VerificationContext } from './context.js';
import type { TaskTiming } from './timing.js';

/**
 * Discriminated outcome of a single verification check.
 *
 * - **success** — the check passed; `message` describes what was validated.
 * - **failure** — the check found a problem; `problems` carries one or more
 *   RFC 9457-style `ProblemDetail` entries.
 * - **skipped** — the check was irrelevant to this input (e.g. no
 *   `credentialStatus`); `reason` explains why.
 *
 * Checks never throw for verification failures — they return a failure outcome.
 * Throws are reserved for unexpected infrastructure errors.
 */
export type CheckOutcome =
  | { status: 'success'; message: string; payload?: unknown }
  | { status: 'failure'; problems: ProblemDetail[] }
  | { status: 'skipped'; reason: string };

/**
 * Tagged outcome emitted by the suite orchestrator.
 *
 * Wraps a `CheckOutcome` with metadata identifying which suite and check
 * produced it. The flat `CheckResult[]` array is the primary report
 * structure returned by `verifyCredential`. When the producing call
 * ran with `timing: true`, each result also carries
 * {@link CheckResult.timing}.
 */
export interface CheckResult {
  /**
   * Dot-separated namespaced id — `<phase>.<suite>.<localPart>`
   * (e.g. `"cryptographic.proof.signature"`). When `phase === suite`
   * the duplicate segment collapses (e.g. `"recognition.profile"`).
   *
   * Computed by the verifier post-`runSuites`. Prefer this over the
   * legacy `check` / `suite` pair when consuming results.
   *
   * Optional today for backwards compatibility with hand-constructed
   * `CheckResult` literals; will become required in a future major.
   */
  id?: string;

  /**
   * @deprecated Use {@link CheckResult.id}. Will be removed in the
   * major release after the one that introduced `id`.
   *
   * Qualified check id, e.g. `"core.proof-exists"`.
   */
  check: string;

  /**
   * @deprecated Use {@link CheckResult.id}. Will be removed in the
   * major release after the one that introduced `id`.
   *
   * Suite id this check belongs to, e.g. `"core"`.
   */
  suite: string;

  outcome: CheckOutcome;
  /**
   * Whether this check was marked fatal in its suite definition.
   * Fatal failures affect the overall `verified` status; non-fatal ones
   * are informational/warnings only.
   */
  fatal?: boolean;
  /**
   * Per-check timing data. Only populated when the producing
   * call ran with `timing: true` on `VerifierConfig` or
   * per-call. See {@link TaskTiming}.
   */
  timing?: TaskTiming;
}

/**
 * Subject types that a check can apply to.
 *
 * Used by `VerificationCheck.appliesTo` to limit a check to credentials,
 * presentations, or both. The orchestrator skips checks whose `appliesTo`
 * doesn't match the current subject.
 */
export type VerificationSubjectType =
  | 'verifiableCredential'
  | 'verifiablePresentation';

/**
 * Suite-phase classification for the two-pass verification workflow.
 *
 * Lets consumers run subsets of the pipeline by passing
 * `phases: [...]` on `VerifierConfig` or per-call. Untagged suites
 * bypass the filter (run in every phase request) — every built-in
 * suite is required to be tagged so the filter is meaningful.
 *
 * - **cryptographic** — structural + signature + status; the work
 *   that must happen first to establish the credential is what it
 *   says it is.
 * - **trust** — trust-layer evaluations like issuer / DID registry
 *   recognition (currently {@link registrySuite}; expected to grow
 *   as additional trust signals are added).
 * - **recognition** — pluggable credential recognition; produces
 *   the normalized credential form. Auto-included when `'semantic'`
 *   is requested (semantic checks may consume the normalized form).
 * - **semantic** — content-aware semantic checks (e.g. OB
 *   cross-field, future verticals).
 *
 * The canonical use case is a two-pass workflow:
 * 1. First pass with no `phases` (or `['cryptographic', 'trust']`)
 *    — full crypto verification of a presentation and its embedded
 *    credentials.
 * 2. Second pass with `phases: ['semantic']` and the
 *    profile-specific suites in `additionalSuites` — re-runs only
 *    the semantic work (recognition is auto-included).
 *
 * The union of both passes' `results` is what a single full-phase
 * pass would have produced.
 */
export type SuitePhase = 'cryptographic' | 'trust' | 'recognition' | 'semantic';

/**
 * A single verification check — the smallest unit of verification logic.
 *
 * Checks are pure async functions: given a subject and context, they return
 * a `CheckOutcome`. They should not have side effects beyond reading from
 * the context's services (document loader, registries, etc.).
 */
export interface VerificationCheck {
  id: string;
  name: string;
  description?: string;
  /** Restricts this check to specific subject types. Unset = runs for all. */
  appliesTo?: readonly VerificationSubjectType[];
  /** If true, a failure stops remaining checks in this suite (later suites still run). */
  fatal?: boolean;
  execute: (
    subject: VerificationSubject,
    context: VerificationContext
  ) => Promise<CheckOutcome>;
}

/**
 * A named, ordered collection of checks — the unit of verification configuration.
 *
 * Suites run sequentially. Within a suite, checks run in array order.
 * Callers can extend the default suites via `additionalSuites` in the
 * options object, or replace them entirely by calling `runSuites` directly.
 */
export interface VerificationSuite {
  id: string;
  name: string;
  description?: string;
  checks: VerificationCheck[];
  /**
   * Optional predicate gating whether this suite runs against the
   * given subject. When false, the orchestrator silently skips —
   * unless the consumer explicitly queued the suite via
   * `additionalSuites`, in which case a synthetic
   * `<suite-id>.applies` `'skipped'` `CheckResult` is emitted so
   * the consumer sees their explicit request was dropped.
   */
  applies?: (
    subject: VerificationSubject,
    context: VerificationContext
  ) => boolean;
  /**
   * Suite-phase tag for the two-pass verification filter; see
   * {@link SuitePhase}. Untagged suites bypass the filter (run in
   * every phase request). All built-in suites are required to be
   * tagged so a `phases:` request reliably partitions them.
   */
  phase?: SuitePhase;
}
