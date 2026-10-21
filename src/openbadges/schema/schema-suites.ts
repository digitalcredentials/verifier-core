/**
 * The two opt-in OpenBadges suite bundles that carry JSON Schema
 * validation, and so load AJV and the bundled Open Badges 3.0 schemas.
 * The AJV-free {@link openBadgesSemanticSuite} lives in the
 * `@digitalcredentials/verifier-core/openbadges` submodule.
 *
 * - {@link openBadgesSchemaSuite} — AJV-backed JSON Schema validation
 *   against the Open Badges 3.0 schemas bundled with this package,
 *   chosen by the credential's type and VC version, plus a report on
 *   a declared `credentialSchema` that does not fit. Never fetches;
 *   each schema is compiled once per process, on first use.
 * - {@link openBadgesSuite} — the semantic checks plus the above.
 *   Convenience for consumers who want full OB coverage and accept
 *   the schema checks' compile cost.
 *
 * @example
 * ```ts
 * import { createVerifier } from '@digitalcredentials/verifier-core';
 * import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges/schema';
 *
 * const verifier = createVerifier();
 * await verifier.verifyCredential({
 *   credential,
 *   additionalSuites: [openBadgesSuite],
 * });
 * ```
 */

import { VerificationSuite } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { openBadgesSemanticSuite } from '../openbadges-suite.js';
import {
  isEndorsementCredential,
  isOpenBadgeCredential
} from '../recognize.js';
import { obv3SchemaCheck } from './obv3-schema-check.js';
import { obv3DeclaredSchemaCheck } from './obv3-declared-schema-check.js';

/**
 * Suite-level applicability predicate for the two schema-carrying
 * bundles: OpenBadgeCredential and EndorsementCredential, since a
 * bundled schema exists for each. Combined with `runSuites`'
 * `explicitSuiteIds` machinery, this gives consumers two crisp
 * signals depending on how they called the verifier:
 *
 * - **Implicit** (default suite set, suite happens to be enabled
 *   elsewhere in the pipeline): other credentials produce zero
 *   results from these suites.
 * - **Explicit** (consumer passes the suite via `additionalSuites`):
 *   other credentials produce exactly one synthetic
 *   `<suite-id>.applies` `'skipped'` `CheckResult` so the consumer
 *   can audit that their request was acknowledged.
 *
 * Within {@link openBadgesSuite}, the semantic checks skip an
 * endorsement themselves: its subject is not an `AchievementSubject`.
 */
const appliesToOpenBadgeOrEndorsement = (
  subject: VerificationSubject
): boolean =>
  isOpenBadgeCredential(subject.verifiableCredential) ||
  isEndorsementCredential(subject.verifiableCredential);

export const openBadgesSchemaSuite: VerificationSuite = {
  id: 'openbadges.schema',
  name: 'OpenBadges JSON Schema',
  description:
    'AJV-backed validation against the bundled Open Badges 3.0 JSON Schemas.',
  phase: 'semantic',
  applies: appliesToOpenBadgeOrEndorsement,
  checks: [obv3SchemaCheck, obv3DeclaredSchemaCheck]
};

export const openBadgesSuite: VerificationSuite = {
  id: 'openbadges',
  name: 'OpenBadges',
  description:
    'OpenBadges 3.0 verification: semantic checks plus JSON Schema validation.',
  phase: 'semantic',
  applies: appliesToOpenBadgeOrEndorsement,
  checks: [...openBadgesSemanticSuite.checks, ...openBadgesSchemaSuite.checks]
};
