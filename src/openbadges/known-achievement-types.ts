/**
 * Snapshots of the OpenBadges `AchievementType` vocabulary, scoped
 * per IMS Global OB version 3.0.
 *
 * Until a version-aware check-selection feature lands, the plain
 * `unknown-achievement-type` check uses
 * {@link KNOWN_ACHIEVEMENT_TYPES} (the "current default" alias),
 * which presently points at the OB 3.0 set. That alias will be
 * updated to track the latest published OB version on each
 * vocab-bumping release. Callers that need version-stable behavior
 * should construct a check via
 * `createObv3UnknownAchievementTypeCheck` against an explicit
 * version-scoped set instead of relying on the alias.
 *
 * Adding a future OB version (illustrative pattern):
 * ```ts
 * export const OB_3_1_ACHIEVEMENT_TYPES: ReadonlySet<string> =
 *   Object.freeze(new Set([
 *     ...OB_3_0_ACHIEVEMENT_TYPES,
 *     'NewlyAddedTokenA',
 *     'NewlyAddedTokenB',
 *   ]));
 * ```
 */

/**
 * `AchievementType` vocabulary as defined in OB 3.0 §B.1.28.
 * Source: https://www.imsglobal.org/spec/ob/v3p0/#achievementtype-enumeration
 *
 * Snapshot taken 2026-04-18. Verify against the current published spec when
 * editing.
 */
export const OB_3_0_ACHIEVEMENT_TYPES: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    'Achievement',
    'ApprenticeshipCertificate',
    'Assessment',
    'Assignment',
    'AssociateDegree',
    'Award',
    'Badge',
    'BachelorDegree',
    'Certificate',
    'CertificateOfCompletion',
    'Certification',
    'CommunityService',
    'Competency',
    'Course',
    'CoCurricular',
    'Degree',
    'Diploma',
    'DoctoralDegree',
    'Fieldwork',
    'GeneralEducationDevelopment',
    'JourneymanCertificate',
    'LearningProgram',
    'License',
    'Membership',
    'ProfessionalDoctorate',
    'QualityAssuranceCredential',
    'MasterCertificate',
    'MasterDegree',
    'MicroCredential',
    'ResearchDoctorate',
    'SecondarySchoolDiploma'
  ])
);

/**
 * Current default `AchievementType` vocab used by the plain
 * {@link obv3UnknownAchievementTypeCheck}.
 *
 * Aliases {@link OB_3_0_ACHIEVEMENT_TYPES}. When a future OB
 * version is added, this alias will be re-pointed (in coordination
 * with a release note) to track the latest known vocabulary.
 * Callers that require version-pinned behavior should reference
 * the version-scoped constant directly.
 */
export const KNOWN_ACHIEVEMENT_TYPES: ReadonlySet<string> =
  OB_3_0_ACHIEVEMENT_TYPES;

/**
 * Reserved prefix the OB spec recognizes for issuer-defined
 * extension tokens. Version-independent — the `ext:` carve-out is a
 * spec-wide extension mechanism, not tied to a specific OB version.
 * Any `achievement.achievementType` value starting with this prefix
 * is treated as a valid extension and is not flagged.
 */
export const ACHIEVEMENT_TYPE_EXT_PREFIX = 'ext:';
