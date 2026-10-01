import { VerificationCheck, CheckOutcome } from '../types/check.js';
import { ProblemDetail } from '../types/problem-detail.js';
import { VerificationSubject } from '../types/subject.js';
import { VerificationContext } from '../types/context.js';
import { Obv3ProblemTypes } from './problem-types.js';
import { Obv3CredentialSubjectShape } from './openbadges-zod.js';
import { formatJsonPointer } from '../util/json-pointer.js';

/**
 * OBv3 missing-`Result.status` check.
 *
 * For every `credentialSubject.result[i]` whose linked
 * `ResultDescription` has `resultType === 'Status'`, asserts that the
 * `Result` carries a non-empty `status` value.
 *
 * Spec anchor: OBv3 §B.1.16 / §B.1.18.
 *
 * The check is **non-fatal** — a missing status is informative but
 * does not invalidate the credential's signature or status.
 *
 * Comparison policy:
 * - `resultType` comparison is **case-sensitive** (`=== 'Status'`).
 *   OBv3 vocabulary tokens are spec-defined as exact strings; we do
 *   not normalize case.
 * - `status: ''` (empty string) is treated as **missing**. The
 *   spec's intent is "did the issuer record a status value"; an
 *   empty string passes type but conveys no information.
 *
 * Skipped when:
 * - The subject has no verifiable credential.
 * - `credentialSubject` cannot be parsed under the OB shape.
 * - There are no `credentialSubject.result` entries.
 * - The credential has no `achievement.resultDescription[]` (no way
 *   to know which results expect Status semantics).
 *
 * Out of scope (intentional non-flagging):
 * - A `Result` that is missing `resultDescription` entirely. Without
 *   a target lookup this check cannot determine whether Status
 *   semantics were intended; a future
 *   `OB_RESULT_REQUIRES_RESULT_DESCRIPTION` check could cover that
 *   case.
 */
export const obv3MissingResultStatusCheck: VerificationCheck = {
  id: 'schema.obv3.missing-result-status',
  name: 'OBv3 Missing Result Status Check',
  description:
    'Validates that result entries linked to Status-typed ResultDescriptions carry a status value.',
  fatal: false,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    _context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | { credentialSubject?: unknown }
      | undefined;

    if (!credential) {
      return {
        status: 'skipped',
        reason: 'No verifiable credential found in subject.'
      };
    }

    const subjectParse = Obv3CredentialSubjectShape.safeParse(
      credential.credentialSubject
    );

    if (!subjectParse.success || !subjectParse.data.result?.length) {
      return {
        status: 'skipped',
        reason: 'Credential has no credentialSubject.result field.'
      };
    }

    const resultDescriptions = subjectParse.data.achievement?.resultDescription;
    if (!resultDescriptions?.length) {
      return {
        status: 'skipped',
        reason:
          'Credential has no achievement.resultDescription[] to validate against.'
      };
    }

    const statusTypedRdIds = new Set<string>();
    for (const rd of resultDescriptions) {
      if (typeof rd.id === 'string' && rd.resultType === 'Status') {
        statusTypedRdIds.add(rd.id);
      }
    }

    if (statusTypedRdIds.size === 0) {
      return {
        status: 'success',
        message:
          'No Status-typed ResultDescription found; missing-result-status check is not applicable.'
      };
    }

    const problems: ProblemDetail[] = [];
    let checkedCount = 0;

    for (let index = 0; index < subjectParse.data.result.length; index++) {
      const entry = subjectParse.data.result[index];
      if (typeof entry.resultDescription !== 'string') {
        continue;
      }
      if (!statusTypedRdIds.has(entry.resultDescription)) {
        continue;
      }
      checkedCount++;

      if (typeof entry.status !== 'string' || entry.status === '') {
        problems.push({
          type: Obv3ProblemTypes.OB_MISSING_RESULT_STATUS,
          title: 'Missing Result Status',
          detail: `Result entry at index ${index} references a Status-typed ResultDescription "${entry.resultDescription}" but is missing a non-empty status value.`,
          instance: formatJsonPointer(['credentialSubject', 'result', index])
        });
      }
    }

    if (problems.length === 0) {
      return {
        status: 'success',
        message: `All ${checkedCount} Status-typed result entries carry a status value.`
      };
    }

    return {
      status: 'failure',
      problems
    };
  }
};
