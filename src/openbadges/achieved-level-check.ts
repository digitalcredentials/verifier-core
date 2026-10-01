import { VerificationCheck, CheckOutcome } from '../types/check.js';
import { ProblemDetail } from '../types/problem-detail.js';
import { VerificationSubject } from '../types/subject.js';
import { VerificationContext } from '../types/context.js';
import { Obv3ProblemTypes } from './problem-types.js';
import { Obv3CredentialSubjectShape } from './openbadges-zod.js';
import { formatJsonPointer } from '../util/json-pointer.js';

/**
 * OBv3 `Result.achievedLevel` validity check.
 *
 * Validates that every `credentialSubject.result[i].achievedLevel`
 * value is one of the `id`s declared in the
 * `RubricCriterionLevel[]` of the `ResultDescription` that the
 * result references via `Result.resultDescription`.
 *
 * Spec anchor: OBv3 §B.1.16.
 *
 * The check is **non-fatal** — an out-of-set or unresolvable
 * `achievedLevel` is informative but does not invalidate the
 * credential's signature or status.
 *
 * Skipped when:
 * - The subject has no verifiable credential.
 * - `credentialSubject` cannot be parsed under the OB shape.
 * - There are no `credentialSubject.result` entries.
 * - The credential has no `achievement.resultDescription[]` (nothing
 *   to validate against).
 *
 * Out of scope (intentional non-flagging — see plan Phase 3):
 * - A `Result` that carries `achievedLevel` but is missing
 *   `resultDescription` entirely. This is a different rule
 *   ("missing reference"); the `result-ref` check only flags
 *   *unresolvable* references, not absent ones, and this check
 *   follows the same convention.
 * - A `RubricCriterionLevel` entry that has no `id`. It is not
 *   addressable, so it is filtered out of the valid-level set; a
 *   future shape-validity check can flag malformed level entries.
 */
export const obv3AchievedLevelCheck: VerificationCheck = {
  id: 'schema.obv3.achieved-level',
  name: 'OBv3 Achieved Level Check',
  description:
    'Validates that result.achievedLevel values reference declared RubricCriterionLevel ids.',
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

    const levelsByRdId = new Map<string, Set<string>>();
    for (const rd of resultDescriptions) {
      if (typeof rd.id !== 'string' || !rd.rubricCriterionLevel?.length) {
        continue;
      }
      const levelIds = new Set(
        rd.rubricCriterionLevel
          .map(level => level.id)
          .filter((id): id is string => typeof id === 'string')
      );
      if (levelIds.size > 0) {
        levelsByRdId.set(rd.id, levelIds);
      }
    }

    const problems: ProblemDetail[] = [];
    let checkedCount = 0;

    for (let index = 0; index < subjectParse.data.result.length; index++) {
      const entry = subjectParse.data.result[index];
      if (typeof entry.achievedLevel !== 'string') {
        continue;
      }
      if (typeof entry.resultDescription !== 'string') {
        continue;
      }
      checkedCount++;

      const achievedLevelPointer = formatJsonPointer([
        'credentialSubject',
        'result',
        index,
        'achievedLevel'
      ]);

      const validLevels = levelsByRdId.get(entry.resultDescription);
      if (!validLevels) {
        problems.push({
          type: Obv3ProblemTypes.OB_INVALID_ACHIEVED_LEVEL,
          title: 'Invalid Achieved Level',
          detail: `Result entry at index ${index} claims achievedLevel "${entry.achievedLevel}", but the referenced ResultDescription "${entry.resultDescription}" declares no rubricCriterionLevel entries.`,
          instance: achievedLevelPointer
        });
        continue;
      }

      if (!validLevels.has(entry.achievedLevel)) {
        const validList = Array.from(validLevels).join(', ');
        problems.push({
          type: Obv3ProblemTypes.OB_INVALID_ACHIEVED_LEVEL,
          title: 'Invalid Achieved Level',
          detail: `Result entry at index ${index} claims achievedLevel "${entry.achievedLevel}" which is not declared in the referenced ResultDescription "${entry.resultDescription}" (valid levels: ${validList}).`,
          instance: achievedLevelPointer
        });
      }
    }

    if (problems.length === 0) {
      return {
        status: 'success',
        message:
          checkedCount === 0
            ? 'No result entries declare achievedLevel; nothing to validate.'
            : `All ${checkedCount} achievedLevel values reference valid RubricCriterionLevel ids.`
      };
    }

    return {
      status: 'failure',
      problems
    };
  }
};
