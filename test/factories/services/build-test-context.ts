/**
 * Test-only helper that assembles a {@link VerificationContext} with
 * sensible defaults — equivalent to the old `buildContext()` from
 * `src/defaults.ts` (deleted in P-A phase 4).
 *
 * Production code does not use this; the public path is
 * `createVerifier(...)`. Suite unit tests use it because they exercise
 * a single suite against a hand-built context, not the full pipeline.
 *
 * Precedence matches the post-P-E production factory: explicit
 * overrides win, otherwise the document loader and JSON fetcher are
 * always derived from the effective `httpGetService` (default or
 * override). No "first-time caller bypass" branch.
 */

import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import { ecdsaRdfc2019 } from '@interop/ecdsa-signature/ecdsa-rdfc-2019';
import { DataIntegrityCryptoService } from '../../../src/services/data-integrity-crypto.js';
import { createRegistryLookup } from '../../../src/services/registry-lookup.js';
import { BuiltinHttpGetService } from '../../../src/services/http-get-service/builtin-http-get-service.js';
import { InMemoryCacheService } from '../../../src/services/cache-service/in-memory-cache-service.js';
import { documentLoaderFromHttpGet } from '../../../src/util/document-loader-from-http-get.js';
import { fetchJsonFromHttpGet } from '../../../src/util/fetch-json-from-http-get.js';
import type { VerificationContext } from '../../../src/types/context.js';
import type { CryptoSuite } from '../../../src/types/crypto-suite.js';

const eddsaSuite = new DataIntegrityProof({
  cryptosuite: eddsaRdfc2022CryptoSuite
});
const ecdsaSuite = new DataIntegrityProof({ cryptosuite: ecdsaRdfc2019 });
const ed25519Suite = new Ed25519Signature2020();

const defaultSuitesForService: CryptoSuite[] = [
  ed25519Suite,
  eddsaSuite,
  ecdsaSuite
];

/** Build a {@link VerificationContext} for tests, optionally overridden. */
export function buildTestContext(
  overrides?: Partial<VerificationContext>
): VerificationContext {
  const cryptoServices = overrides?.cryptoServices ?? [
    DataIntegrityCryptoService({ suites: defaultSuitesForService })
  ];

  const effectiveHttpGetService =
    overrides?.httpGetService ?? BuiltinHttpGetService();
  const effectiveCacheService =
    overrides?.cacheService ?? InMemoryCacheService();

  const documentLoader =
    overrides?.documentLoader ??
    documentLoaderFromHttpGet(effectiveHttpGetService);

  const fetchJson =
    overrides?.fetchJson ?? fetchJsonFromHttpGet(effectiveHttpGetService);

  return {
    documentLoader,
    fetchJson,
    httpGetService: effectiveHttpGetService,
    cacheService: effectiveCacheService,
    cryptoServices,
    registries: overrides?.registries,
    lookupIssuers:
      overrides?.lookupIssuers ??
      createRegistryLookup(effectiveHttpGetService, effectiveCacheService),
    challenge: overrides?.challenge ?? null,
    unsignedPresentation: overrides?.unsignedPresentation ?? false
  };
}
