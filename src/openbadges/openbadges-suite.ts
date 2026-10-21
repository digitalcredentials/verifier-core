/**
 * The AJV-free opt-in OpenBadges suite bundle.
 *
 * {@link openBadgesSemanticSuite} — fast, in-process Zod-based
 * cross-field semantic checks. Loads no JSON Schema validator. Safe to
 * enable in latency-sensitive contexts, and under a Content Security
 * Policy that forbids `unsafe-eval`.
 *
 * The bundles that add JSON Schema validation, `openBadgesSchemaSuite`
 * and `openBadgesSuite` (semantic plus schema), live in the
 * `@digitalcredentials/verifier-core/openbadges/schema` submodule, so
 * importing this one never loads AJV or the bundled schemas.
 *
 * None of these are part of the verifier's default suite set:
 * OpenBadges verification is fully opt-in, so a caller who does not
 * ask for it pays none of its cost. To enable:
 *
 * @example
 * ```ts
 * import { createVerifier } from '@digitalcredentials/verifier-core';
 * import { openBadgesSemanticSuite } from '@digitalcredentials/verifier-core/openbadges';
 *
 * const verifier = createVerifier();
 * await verifier.verifyCredential({
 *   credential,
 *   additionalSuites: [openBadgesSemanticSuite],
 * });
 * ```
 */

import { VerificationSuite } from '../types/check.js';
import { VerificationSubject } from '../types/subject.js';
import { obv3ResultRefCheck } from './result-ref-check.js';
import { obv3AchievedLevelCheck } from './achieved-level-check.js';
import { obv3MissingResultStatusCheck } from './missing-result-status-check.js';
import { obv3UnknownAchievementTypeCheck } from './unknown-achievement-type-check.js';
import { isOpenBadgeCredential } from './recognize.js';

/**
 * Suite-level applicability predicate for the semantic bundle:
 * OpenBadgeCredential only, since the semantic checks read an
 * `AchievementSubject`. Combined with `runSuites`' `explicitSuiteIds`
 * machinery, this gives consumers two crisp signals depending on how
 * they called the verifier:
 *
 * - **Implicit** (default suite set, suite happens to be enabled
 *   elsewhere in the pipeline): non-OB credentials produce zero
 *   results from this suite.
 * - **Explicit** (consumer passes the suite via `additionalSuites`):
 *   non-OB credentials produce exactly one synthetic
 *   `<suite-id>.applies` `'skipped'` `CheckResult` so the consumer
 *   can audit that their request was acknowledged.
 */
const appliesToOpenBadge = (subject: VerificationSubject): boolean =>
  isOpenBadgeCredential(subject.verifiableCredential);

export const openBadgesSemanticSuite: VerificationSuite = {
  id: 'openbadges.semantic',
  name: 'OpenBadges Semantic',
  description:
    'OpenBadges 3.0 cross-field semantic checks (no JSON Schema validation).',
  phase: 'semantic',
  applies: appliesToOpenBadge,
  checks: [
    obv3ResultRefCheck,
    obv3AchievedLevelCheck,
    obv3MissingResultStatusCheck,
    obv3UnknownAchievementTypeCheck
  ]
};
