/**
 * Pluggable credential recognition.
 *
 * A {@link RecognizerSpec} answers "is this credential profile X?"
 * and, if so, returns a normalized parsed view of it. Recognizers
 * are registered via {@link VerifierConfig.recognizers}; the
 * built-in `recognitionSuite` iterates them and surfaces the first
 * applies-true match's normalized form on
 * {@link CredentialVerificationResult.normalizedVerifiableCredential}
 * + {@link CredentialVerificationResult.recognizedProfile}.
 *
 * @see `docs/plans/2026-04-18-openbadges-recognizer-and-subchecks/00-design.md`
 */

import type { ProblemDetail } from './problem-detail.js';
import type { VerificationContext } from './context.js';

/**
 * Discriminated outcome of a recognizer's parse step.
 *
 * - **recognized** — the credential matched the recognizer's
 *   profile and parsed cleanly. `normalized` is the recognizer's
 *   normalized view of the credential (e.g., string IRIs lifted
 *   to `{ id }` objects). `profile` echoes the recognizer's id.
 * - **malformed** — the credential matched the recognizer's
 *   `applies` predicate but failed to parse. `problems` carries
 *   per-portion attribution (RFC 9457 + RFC 6901 JSON Pointers
 *   on `ProblemDetail.instance`).
 */
export type RecognitionResult =
  | { status: 'recognized'; profile: string; normalized: unknown }
  | { status: 'malformed'; profile: string; problems: ProblemDetail[] };

/**
 * Pluggable credential-recognition spec.
 *
 * `id` is the stable string surfaced as `recognizedProfile` on
 * {@link CredentialVerificationResult} (e.g., `'obv3p0.openbadge'`).
 * Consumers narrow `normalizedVerifiableCredential` based on this
 * id.
 *
 * Recognizers run in registration order; the first whose `applies`
 * predicate returns true is selected and its `parse` function
 * called. Subsequent recognizers are not consulted for the same
 * credential.
 */
export interface RecognizerSpec {
  id: string;
  name: string;
  applies: (subject: unknown, context: VerificationContext) => boolean;
  parse: (credential: unknown) => RecognitionResult;
}
