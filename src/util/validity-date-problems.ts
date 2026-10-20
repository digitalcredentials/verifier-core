/**
 * Recognising a crypto service's validity-date problems.
 *
 * A crypto service reports `CREDENTIAL_EXPIRED` or
 * `CREDENTIAL_NOT_YET_VALID` only when the proof itself verified (see
 * `CryptoService`). So a rejection made only of those problems proves
 * the document is authentic and merely out of date: `proof.signature`
 * reads it as a verified signature, and `status.bitstring` as an
 * expired or not-yet-valid list rather than a bad one.
 */

import { ProblemTypes } from '../problem-types.js';
import type { ProblemDetail } from '../types/problem-detail.js';

/** Whether `problem` is a validity-date problem. */
export function isValidityDateProblem(problem: ProblemDetail): boolean {
  return (
    problem.type === ProblemTypes.CREDENTIAL_EXPIRED ||
    problem.type === ProblemTypes.CREDENTIAL_NOT_YET_VALID
  );
}

/**
 * Whether a rejection's `problems` are all validity-date problems, and
 * there is at least one: the proof verified, and only the dates failed.
 */
export function isValidityDateOnly(problems: ProblemDetail[]): boolean {
  return problems.length > 0 && problems.every(isValidityDateProblem);
}
