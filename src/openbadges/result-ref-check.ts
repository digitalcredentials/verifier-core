import { VerificationCheck, CheckOutcome } from '../types/check.js';
import { ProblemDetail } from '../types/problem-detail.js';
import { VerificationSubject } from '../types/subject.js';
import { VerificationContext } from '../types/context.js';
import { Obv3ProblemTypes } from './problem-types.js';
import { Obv3CredentialSubjectShape } from './openbadges-zod.js';
import { formatJsonPointer } from '../util/json-pointer.js';

/**
 * OBv3 Result→ResultDescription reference check.
 *
 * Validates that every `credentialSubject.result[i].resultDescription`
 * URI matches a `credentialSubject.achievement.resultDescription[].id`
 * declared on the credential's achievement.
 *
 * The check is **non-fatal** — a broken cross-reference is informative
 * but does not invalidate the credential's signature or status.
 *
 * Skipped when:
 * - The subject has no verifiable credential.
 * - `credentialSubject` cannot be parsed under
 *   {@link Obv3CredentialSubjectShape} (e.g. wrong shape entirely).
 * - There are no `credentialSubject.result` entries.
 */
export const obv3ResultRefCheck: VerificationCheck = {
  id: 'schema.obv3.result-ref',
  name: 'OBv3 Result Reference Check',
  description:
    'Validates that result entries reference valid ResultDescription IDs.',
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

    const knownIds = new Set(
      subjectParse.data.achievement?.resultDescription
        ?.map(rd => rd.id)
        .filter((id): id is string => typeof id === 'string') ?? []
    );

    const invalid = subjectParse.data.result
      .map((entry, index) => ({ index, ref: entry.resultDescription }))
      .filter(
        (entry): entry is { index: number; ref: string } =>
          typeof entry.ref === 'string' && !knownIds.has(entry.ref)
      );

    if (invalid.length === 0) {
      return {
        status: 'success',
        message: `All ${subjectParse.data.result.length} result entries reference valid ResultDescription IDs.`
      };
    }

    const problems: ProblemDetail[] = invalid.map(({ index, ref }) => ({
      type: Obv3ProblemTypes.OB_INVALID_RESULT_REFERENCE,
      title: 'Invalid Result Reference',
      detail: `Result entry at index ${index} references ResultDescription id "${ref}" which does not exist in achievement.resultDescription`,
      instance: formatJsonPointer([
        'credentialSubject',
        'result',
        index,
        'resultDescription'
      ])
    }));

    return {
      status: 'failure',
      problems
    };
  }
};
