import { VerificationCheck, CheckOutcome } from '../types/check.js';
import { ProblemDetail } from '../types/problem-detail.js';
import { VerificationSubject } from '../types/subject.js';
import { Obv3ProblemTypes } from './problem-types.js';
import { Obv3CredentialSubjectShape } from './openbadges-zod.js';
import {
  KNOWN_ACHIEVEMENT_TYPES,
  ACHIEVEMENT_TYPE_EXT_PREFIX
} from './known-achievement-types.js';
import { formatJsonPointer } from '../util/json-pointer.js';

const CHECK_ID = 'schema.obv3.unknown-achievement-type';
const CHECK_NAME = 'OBv3 Unknown AchievementType Check';
const CHECK_DESCRIPTION =
  'Flags achievement.achievementType values that are neither in the known OBv3 vocabulary nor a caller-supplied augment, and do not use the "ext:" extension prefix.';

/**
 * Returns a list of problems for the given `achievementType` value
 * (string or string[]). Non-string entries are silently ignored —
 * shape errors are the responsibility of a future shape-validity
 * check, not this vocabulary check.
 */
function evaluateAchievementType(
  value: unknown,
  knownTypes: ReadonlySet<string>
): ProblemDetail[] {
  if (value === undefined) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);
  const problems: ProblemDetail[] = [];

  for (let index = 0; index < values.length; index++) {
    const entry = values[index];
    if (typeof entry !== 'string') {
      continue;
    }
    if (knownTypes.has(entry)) {
      continue;
    }
    if (entry.startsWith(ACHIEVEMENT_TYPE_EXT_PREFIX)) {
      continue;
    }

    const target = isArray
      ? `achievement.achievementType[${index}]`
      : 'achievement.achievementType';
    const pointerSegments: Array<string | number> = isArray
      ? ['credentialSubject', 'achievement', 'achievementType', index]
      : ['credentialSubject', 'achievement', 'achievementType'];
    problems.push({
      type: Obv3ProblemTypes.OB_UNKNOWN_ACHIEVEMENT_TYPE,
      title: 'Unknown Achievement Type',
      detail: `${target} = "${entry}" is not in the known AchievementType vocabulary and does not use the "${ACHIEVEMENT_TYPE_EXT_PREFIX}" extension prefix.`,
      instance: formatJsonPointer(pointerSegments)
    });
  }

  return problems;
}

/**
 * Shared execute body for both the plain check and the factory
 * variant. Bound to a `knownTypes` set at construction time.
 */
async function executeForKnownTypes(
  subject: VerificationSubject,
  knownTypes: ReadonlySet<string>
): Promise<CheckOutcome> {
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

  const achievementType = subjectParse.success
    ? subjectParse.data.achievement?.achievementType
    : undefined;

  if (achievementType === undefined) {
    return {
      status: 'skipped',
      reason: 'Credential has no achievement.achievementType to evaluate.'
    };
  }

  const problems = evaluateAchievementType(achievementType, knownTypes);

  if (problems.length === 0) {
    return {
      status: 'success',
      message: 'All achievement.achievementType values are recognized.'
    };
  }

  return {
    status: 'failure',
    problems
  };
}

/**
 * OBv3 `achievement.achievementType` vocabulary check.
 *
 * Flags any token that is neither in the built-in OBv3
 * `AchievementType` vocabulary
 * ({@link KNOWN_ACHIEVEMENT_TYPES}) nor uses the spec's
 * reserved `ext:` extension prefix. Accepts both single-string and
 * `string[]` forms of `achievement.achievementType` and reports one
 * `ProblemDetail` per offending entry (with array index in the
 * `detail` for arrays).
 *
 * The check is **non-fatal**.
 *
 * Skipped when:
 * - The subject has no verifiable credential.
 * - `achievement.achievementType` is missing.
 *
 * If a tenant or consumer needs to recognize types beyond the
 * built-in vocab without using the `ext:` prefix, prefer
 * {@link createObv3UnknownAchievementTypeCheck} with
 * `additionalKnownTypes`.
 */
export const obv3UnknownAchievementTypeCheck: VerificationCheck = {
  id: CHECK_ID,
  name: CHECK_NAME,
  description: CHECK_DESCRIPTION,
  fatal: false,
  appliesTo: ['verifiableCredential'],
  execute: async subject =>
    executeForKnownTypes(subject, KNOWN_ACHIEVEMENT_TYPES)
};

export interface CreateObv3UnknownAchievementTypeCheckOptions {
  /**
   * Additional `achievement.achievementType` tokens to treat as
   * valid alongside the built-in OBv3 vocabulary. Use this for
   * tenant-specific tokens that predate the `ext:` convention or
   * that you treat as first-class for your own audit purposes.
   *
   * The `ext:` prefix carve-out is always honored regardless of
   * what is passed here.
   */
  additionalKnownTypes?: Iterable<string>;
}

/**
 * Factory for an `unknown-achievement-type` check whose acceptance
 * set is the built-in vocabulary plus a caller-supplied augment.
 *
 * The returned check has the same id and shape as
 * {@link obv3UnknownAchievementTypeCheck}; the only difference is
 * the `knownTypes` set bound at construction time.
 *
 * @example
 * ```ts
 * const check = createObv3UnknownAchievementTypeCheck({
 *   additionalKnownTypes: ['CompanyInternalCertification'],
 * });
 * ```
 */
export function createObv3UnknownAchievementTypeCheck(
  options: CreateObv3UnknownAchievementTypeCheckOptions = {}
): VerificationCheck {
  const knownTypes: ReadonlySet<string> = new Set([
    ...KNOWN_ACHIEVEMENT_TYPES,
    ...(options.additionalKnownTypes ?? [])
  ]);
  return {
    id: CHECK_ID,
    name: CHECK_NAME,
    description: CHECK_DESCRIPTION,
    fatal: false,
    appliesTo: ['verifiableCredential'],
    execute: async subject => executeForKnownTypes(subject, knownTypes)
  };
}
