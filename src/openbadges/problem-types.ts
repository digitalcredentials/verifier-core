/**
 * Open Badges problem-type URIs.
 *
 * These tokens use the cross-version `OB_*` form (not `OBV3_*`) because
 * the underlying rules live in the OpenBadges cross-version vocabulary
 * and are expected to apply equally to OBv3, future OBv4, etc. The
 * internal const is named `Obv3ProblemTypes` to match the file's
 * historical naming and the `obv3/` knowledge folders; the public
 * submodule barrel re-exports it under the headline alias
 * `OpenBadgesProblemTypes`.
 *
 * Wire URIs use the same `https://www.w3.org/TR/vc-data-model#…`
 * placeholder host as the rest of the catalog. See
 * `docs/plans/2026-04-17-architecture-readiness-review/draft-ob-spec-issue-problem-details-registry.md`
 * for why we treat these as opaque keys until a real registry exists.
 */

export const Obv3ProblemTypes = {
  /**
   * Synthesized — a `Result.resultDescription` references a
   * `ResultDescription.id` that does not exist in the credential's
   * `achievement.resultDescription[]`.
   */
  OB_INVALID_RESULT_REFERENCE:
    'https://www.w3.org/TR/vc-data-model#OB_INVALID_RESULT_REFERENCE',

  /**
   * Synthesized — a `Result.achievedLevel` value is not present in
   * the `RubricCriterionLevel[].id` set of the `ResultDescription`
   * the result references via `Result.resultDescription`. Also
   * emitted when the referenced `ResultDescription` declares no
   * `rubricCriterionLevel[]` (no addressable levels).
   *
   * Spec anchor: OBv3 §B.1.16.
   */
  OB_INVALID_ACHIEVED_LEVEL:
    'https://www.w3.org/TR/vc-data-model#OB_INVALID_ACHIEVED_LEVEL',

  /**
   * Synthesized — a `Result` whose linked `ResultDescription` has
   * `resultType: 'Status'` is missing the `status` field (or has it
   * as an empty string). The Status `resultType` declares that the
   * issuer intends to record a status value (`Completed`, `Failed`,
   * `Pending`, `InProgress`, `Withdrawn`, etc.); absence of `status`
   * in that case is a data-integrity violation.
   *
   * Spec anchor: OBv3 §B.1.16 / §B.1.18.
   */
  OB_MISSING_RESULT_STATUS:
    'https://www.w3.org/TR/vc-data-model#OB_MISSING_RESULT_STATUS',

  /**
   * Synthesized — an `achievement.achievementType` value is neither
   * in the OBv3 built-in `AchievementType` vocabulary nor a
   * caller-supplied augment, and does not use the reserved `ext:`
   * extension prefix.
   *
   * Spec anchor: OBv3 §6 / §B.1.1 (`AchievementType` enumeration);
   * the `ext:` prefix carve-out is the spec-sanctioned path for
   * issuer-defined extensions.
   */
  OB_UNKNOWN_ACHIEVEMENT_TYPE:
    'https://www.w3.org/TR/vc-data-model#OB_UNKNOWN_ACHIEVEMENT_TYPE'
} as const;

export type Obv3ProblemType =
  (typeof Obv3ProblemTypes)[keyof typeof Obv3ProblemTypes];
