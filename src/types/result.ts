import { CheckResult } from './check.js';
import { SuiteSummary } from './suite-summary.js';
import type { TaskTiming } from './timing.js';
import { VerifiableCredential } from '../schemas/credential.js';
import { VerifiablePresentation } from '../schemas/presentation.js';

export interface CredentialVerificationResult {
  /**
   * True if no *fatal* check returned a failure outcome.
   *
   * Advisory (non-fatal) checks never flip it: `registry.issuer`,
   * `recognition.profile`, `status.list-issuer`, the Open Badges
   * checks (the semantic `schema.obv3.*` checks and the Open
   * Badges JSON-schema check), and any caller-supplied check that
   * leaves `fatal` unset. So a credential whose only failing check
   * is the registry lookup is `verified: true`, with
   * `status: 'failure'` and no `fatalFailureAt` on its
   * `trust.registry` summary — read {@link summary} to surface
   * advisory failures. `verified` is `false` exactly when one of
   * the summaries carries {@link SuiteSummary.fatalFailureAt}.
   */
  verified: boolean;

  /**
   * The credential that was verified: the caller's original
   * object, returned as it came in. Zod gates the input but does
   * not normalize it, so nothing here is rewritten.
   *
   * Field name matches the W3C / VCALM property name so the
   * verification result can be spread directly into a VCALM
   * exchange's per-step variables and accessed via the documented
   * JSONata path:
   *   `results.<step>.credentialResults[i].verifiableCredential.…`
   */
  verifiableCredential: VerifiableCredential;

  /**
   * Normalized view of the credential, produced by a recognizer.
   *
   * Present when the `recognition.profile` check (in the default
   * `recognitionSuite`) found a matching {@link RecognizerSpec}
   * and that recognizer's parse step succeeded. Cast to the
   * recognizer-specific shape based on {@link recognizedProfile}.
   *
   * @example
   *   if (result.recognizedProfile === 'obv3p0.openbadge') {
   *     const ob = result.normalizedVerifiableCredential as
   *       Obv3p0OpenBadgeCredential;
   *   }
   */
  normalizedVerifiableCredential?: unknown;

  /**
   * Stable id of the matched recognizer; mirrors
   * {@link RecognizerSpec.id}. Present iff
   * {@link normalizedVerifiableCredential} is.
   */
  recognizedProfile?: string;

  /**
   * Flat array of check results: every check that ran, every
   * check that was skipped (with its reason), and every check
   * that was not run because an earlier fatal failure halted the
   * pipeline (reason starting `Not run: `). A check that passed
   * and a check that never ran are therefore distinguishable.
   */
  results: CheckResult[];

  /**
   * Per-suite rollup of every (phase, suite) that ran. Primary
   * surface for UI rendering; lazy-expand into {@link results}
   * for per-check detail. See {@link SuiteSummary}.
   */
  summary: SuiteSummary[];

  /**
   * `true` when this result was produced under a non-default
   * suite-phase filter (i.e. the consumer passed `phases: [...]` on
   * `VerifierConfig` or per-call). A partial result carries only
   * the subset of suites in the requested phases, plus any
   * untagged suites; consumers running a two-pass workflow union
   * the per-pass `results` arrays to reconstruct the full report.
   *
   * Unset for the default (all-phases) case so existing consumers
   * see no change in result shape.
   */
  partial?: boolean;

  /**
   * Inclusive top-level timing for the producing
   * `verifyCredential` call (start before any work, end after
   * all checks settle). Only present when the call ran with
   * `timing: true`. See {@link TaskTiming} and
   * {@link CheckResult.timing}.
   */
  timing?: TaskTiming;
}

export interface PresentationVerificationResult {
  /**
   * True if no *fatal* presentation check failed and every
   * embedded credential is itself `verified`. Advisory
   * (non-fatal) failures never flip it; see
   * {@link CredentialVerificationResult.verified} for which
   * checks are advisory.
   */
  verified: boolean;

  /**
   * The presentation that was verified: the caller's original
   * object, returned as it came in.
   *
   * Mirror of {@link CredentialVerificationResult.verifiableCredential}.
   * Allows VCALM consumers to reach the VP via the documented
   * `results.<step>.verifiablePresentation.…` JSONata path without
   * carrying the original input separately.
   */
  verifiablePresentation: VerifiablePresentation;

  /**
   * Check results from presentation-level verification (VP
   * signature). Carries every check, the same way
   * {@link CredentialVerificationResult.results} does.
   */
  presentationResults: CheckResult[];

  /** Individual credential verification results, one per embedded VC. */
  credentialResults: CredentialVerificationResult[];

  /**
   * Per-suite rollup of presentation-level checks (i.e. the
   * suites that produced {@link presentationResults}). Per-credential
   * rollups live on each {@link credentialResults} entry's own
   * `summary`.
   */
  summary: SuiteSummary[];

  /**
   * `true` when this result was produced under a non-default
   * suite-phase filter; mirrors
   * {@link CredentialVerificationResult.partial}.
   */
  partial?: boolean;

  /**
   * Inclusive top-level timing for the producing
   * `verifyPresentation` call. Only present when the call ran
   * with `timing: true`. Wraps presentation-level checks and
   * every recursive `verifyCredential` invoked for embedded
   * VCs. See {@link TaskTiming}.
   */
  timing?: TaskTiming;
}
