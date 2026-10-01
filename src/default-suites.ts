/**
 * Default verification suites used by `createVerifier`.
 *
 * Run in order for every credential, with each suite's `phase` tag
 * shown in parentheses (the tag drives the two-pass `phases:`
 * filter on `VerifierConfig`; see {@link SuitePhase}):
 *
 * 1. **core** (cryptographic) — structure validation (context, VC context URI, credential id, proof exists)
 * 2. **recognition** (recognition) — pluggable credential-profile recognition (no-op when no recognizers configured)
 * 3. **proof** (cryptographic) — cryptographic signature verification
 * 4. **status** (cryptographic) — revocation/suspension via BitstringStatusList
 * 5. **registry** (trust) — issuer DID lookup in known registries
 *
 * The `recognitionSuite` runs after `core` so structurally
 * malformed credentials don't reach recognition, and before `proof`
 * so the normalized credential form is available to any later suite
 * that wants to consult it. With no
 * {@link VerifierConfig.recognizers} configured it emits `'skipped'`
 * — zero behavior change for consumers who don't opt in.
 *
 * OpenBadges 3.0 verification (semantic checks and JSON Schema
 * validation) is opt-in and lives in the
 * `@digitalcredentials/verifier-core/openbadges` submodule. Add it
 * via `additionalSuites`:
 *
 * ```ts
 * import { createVerifier } from '@digitalcredentials/verifier-core';
 * import {
 *   obv3p0Recognizer,
 *   openBadgesSuite,
 * } from '@digitalcredentials/verifier-core/openbadges';
 *
 * const verifier = createVerifier({ recognizers: [obv3p0Recognizer] });
 * await verifier.verifyCredential({
 *   credential,
 *   additionalSuites: [openBadgesSuite],
 * });
 * ```
 *
 * `proofSuite` is statically imported here so the verifier has no
 * dynamic-import sites in its hot path.
 */

import { VerificationSuite } from './types/check.js';
import { coreSuite } from './suites/core/index.js';
import { recognitionSuite } from './suites/recognition/index.js';
import { proofSuite } from './suites/proof/index.js';
import { statusSuite } from './suites/status/index.js';
import { registrySuite } from './suites/registry/index.js';

export const defaultSuites: VerificationSuite[] = [
  coreSuite,
  recognitionSuite,
  proofSuite,
  statusSuite,
  registrySuite
];
