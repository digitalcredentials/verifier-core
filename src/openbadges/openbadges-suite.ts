/**
 * Three opt-in OpenBadges verification suite bundles.
 *
 * Consumers compose verifier configurations by passing one (or more)
 * of these to a verify call's `additionalSuites`:
 *
 * - {@link openBadgesSemanticSuite} — fast, in-process Zod-based
 *   cross-field semantic checks. **No network access required.**
 *   Safe to enable in latency-sensitive contexts.
 * - {@link openBadgesSchemaSuite} — AJV-backed JSON Schema validation
 *   against the published OBv3 schemas. Requires fetching the schema
 *   document at first use; subsequent runs reuse the AJV instance's
 *   in-memory cache.
 * - {@link openBadgesSuite} — the union of the two above. Convenience
 *   for consumers who want full OB coverage and accept the schema
 *   suite's network cost.
 *
 * None of these are part of the verifier's default suite set; the
 * 2026-04-18 plan ([Q2](../../docs/plans/2026-04-18-openbadges-module/00-questions.md#q2-default-path-behavior))
 * makes OpenBadges verification fully opt-in. To enable:
 *
 * @example
 * ```ts
 * import { createVerifier } from '@digitalcredentials/verifier-core';
 * import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges';
 *
 * const verifier = createVerifier();
 * await verifier.verifyCredential({
 *   credential,
 *   additionalSuites: [openBadgesSuite],
 * });
 * ```
 */

import { VerificationSuite } from '../types/check.js';
import { VerificationSubject } from '../types/subject.js';
import { obv3ResultRefCheck } from './result-ref-check.js';
import { obv3AchievedLevelCheck } from './achieved-level-check.js';
import { obv3MissingResultStatusCheck } from './missing-result-status-check.js';
import { obv3UnknownAchievementTypeCheck } from './unknown-achievement-type-check.js';
import { obv3SchemaCheck } from '../suites/schema/obv3/obv3-schema-check.js';
import { isOpenBadgeCredential } from './recognize.js';

/**
 * Suite-level applicability predicate shared by all three OB
 * bundles. Combined with `runSuites`' `explicitSuiteIds` machinery,
 * this gives consumers two crisp signals depending on how they
 * called the verifier:
 *
 * - **Implicit** (default suite set, suite happens to be enabled
 *   elsewhere in the pipeline): non-OB credentials produce zero
 *   results from these suites.
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
    'OpenBadges 3.0 cross-field semantic checks (no JSON Schema fetch).',
  phase: 'semantic',
  applies: appliesToOpenBadge,
  checks: [
    obv3ResultRefCheck,
    obv3AchievedLevelCheck,
    obv3MissingResultStatusCheck,
    obv3UnknownAchievementTypeCheck
  ]
};

export const openBadgesSchemaSuite: VerificationSuite = {
  id: 'openbadges.schema',
  name: 'OpenBadges JSON Schema',
  description: 'AJV-backed validation against the published OBv3 JSON Schemas.',
  phase: 'semantic',
  applies: appliesToOpenBadge,
  checks: [obv3SchemaCheck]
};

export const openBadgesSuite: VerificationSuite = {
  id: 'openbadges',
  name: 'OpenBadges',
  description:
    'OpenBadges 3.0 verification: semantic checks plus JSON Schema validation.',
  phase: 'semantic',
  applies: appliesToOpenBadge,
  checks: [...openBadgesSemanticSuite.checks, ...openBadgesSchemaSuite.checks]
};
