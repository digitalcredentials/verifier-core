/**
 * Public submodule entry point: `@digitalcredentials/verifier-core/openbadges`.
 *
 * Curated re-exports for OpenBadges 3.0 verification. Importing this
 * submodule does **not** affect the default verifier behavior — every
 * suite, check, and helper exported here is opt-in and must be
 * passed explicitly via a verify call's `additionalSuites` (or
 * composed into a custom suite).
 *
 * Surface follows the design in
 * `docs/plans/2026-04-18-openbadges-module/00-design.md`:
 *
 * - **Suites** (most common entry point):
 *   {@link openBadgesSuite}, {@link openBadgesSemanticSuite},
 *   {@link openBadgesSchemaSuite}.
 * - **Individual checks** for callers who want to compose their own
 *   suites a la carte: {@link obv3ResultRefCheck},
 *   {@link obv3AchievedLevelCheck},
 *   {@link obv3MissingResultStatusCheck},
 *   {@link obv3UnknownAchievementTypeCheck},
 *   {@link obv3SchemaCheck}.
 * - **Factory** for the achievement-type check with a caller-supplied
 *   vocab augment: {@link createObv3UnknownAchievementTypeCheck}.
 * - **Recognition helpers** for branching on credential shape:
 *   {@link isOpenBadgeCredential}, {@link isEndorsementCredential}.
 * - **Problem types**: {@link OpenBadgesProblemTypes} (preferred name)
 *   and the legacy alias `Obv3ProblemTypes` (kept for symmetry with
 *   internal naming and to ease migration of any in-flight callers).
 * - **Vocabulary**: {@link KNOWN_ACHIEVEMENT_TYPES} (current default,
 *   used by the plain check) and {@link OB_3_0_ACHIEVEMENT_TYPES}
 *   (version-pinned). Plus {@link ACHIEVEMENT_TYPE_EXT_PREFIX} for
 *   callers that need to recognize the spec-sanctioned extension
 *   prefix in their own logic or UI.
 */

export {
  openBadgesSuite,
  openBadgesSemanticSuite,
  openBadgesSchemaSuite
} from './openbadges-suite.js';

export { obv3ResultRefCheck } from './result-ref-check.js';
export { obv3AchievedLevelCheck } from './achieved-level-check.js';
export { obv3MissingResultStatusCheck } from './missing-result-status-check.js';
export {
  obv3UnknownAchievementTypeCheck,
  createObv3UnknownAchievementTypeCheck
} from './unknown-achievement-type-check.js';
export type { CreateObv3UnknownAchievementTypeCheckOptions } from './unknown-achievement-type-check.js';

export { obv3SchemaCheck } from '../suites/schema/obv3/obv3-schema-check.js';

export { isOpenBadgeCredential, isEndorsementCredential } from './recognize.js';

export {
  obv3p0Recognizer,
  obv3p0EndorsementRecognizer
} from './recognizers.js';

export {
  Obv3p0OpenBadgeCredentialSchema,
  parseObv3p0OpenBadgeCredential
} from './schemas/openbadge-credential-v3p0.js';
export type { Obv3p0OpenBadgeCredential } from './schemas/openbadge-credential-v3p0.js';

export {
  Obv3p0EndorsementCredentialSchema,
  Obv3p0EndorsementSubjectSchema,
  parseObv3p0EndorsementCredential
} from './schemas/endorsement-credential-v3p0.js';
export type {
  Obv3p0EndorsementCredential,
  Obv3p0EndorsementSubject
} from './schemas/endorsement-credential-v3p0.js';

export {
  Obv3p0ImageSchema,
  ImageField,
  Obv3p0ProfileSchema,
  ProfileRefField,
  Obv3p0AlignmentSchema,
  Obv3p0AchievementSchema,
  Obv3p0AchievementSubjectSchema,
  Obv3p0RubricCriterionLevelSchema,
  Obv3p0ResultDescriptionSchema,
  Obv3p0ResultSchema
} from './schemas/classes-v3p0.js';
export type {
  Obv3p0Image,
  Obv3p0Profile,
  Obv3p0Alignment,
  Obv3p0Achievement,
  Obv3p0AchievementSubject,
  Obv3p0RubricCriterionLevel,
  Obv3p0ResultDescription,
  Obv3p0Result
} from './schemas/classes-v3p0.js';

export {
  Obv3ProblemTypes as OpenBadgesProblemTypes,
  Obv3ProblemTypes
} from './problem-types.js';
export type {
  Obv3ProblemType as OpenBadgesProblemType,
  Obv3ProblemType
} from './problem-types.js';

export {
  KNOWN_ACHIEVEMENT_TYPES,
  OB_3_0_ACHIEVEMENT_TYPES,
  ACHIEVEMENT_TYPE_EXT_PREFIX
} from './known-achievement-types.js';
