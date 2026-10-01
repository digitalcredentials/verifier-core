/**
 * Lazy memoized factories for the default service implementations the
 * `Verifier` falls back to when the caller doesn't pass overrides.
 *
 * Memoization is per-process and only of *construction* — never of
 * mutable state.
 *
 * - `defaultHttpGetService()` returns a memoized
 *   `BuiltinHttpGetService` (stateless adapter; safe to share).
 * - `defaultCryptoSuites()` and `defaultCryptoServices()` cache the
 *   constructed instances so we don't pay for repeated module setup;
 *   the suites/services themselves carry no cross-call state.
 * - `defaultDocumentLoaderFor()` always derives a JSON-LD loader
 *   from the given `httpGetService` (so all remote fetches share the
 *   verifier's cache); the per-service loader is memoized via a
 *   `WeakMap` so repeat calls reuse the same `CachedResolver` and
 *   protocol handlers.
 * - `createDefaultCacheService()` returns a **fresh**
 *   `InMemoryCacheService` on every call so two independent
 *   `createVerifier()` calls do not share cache state. Callers who
 *   want cross-verifier sharing pass an explicit `cacheService`.
 *
 * Internal module — not exported from `index.ts`.
 */

import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import { ecdsaRdfc2019 } from '@interop/ecdsa-signature/ecdsa-rdfc-2019';
import { BuiltinHttpGetService } from './services/http-get-service/builtin-http-get-service.js';
import { InMemoryCacheService } from './services/cache-service/in-memory-cache-service.js';
import { DataIntegrityCryptoService } from './services/data-integrity-crypto.js';
import { documentLoaderFromHttpGet } from './util/document-loader-from-http-get.js';
import type { CryptoService } from './types/crypto-service.js';
import type { CryptoSuite } from './types/crypto-suite.js';
import type { DocumentLoader } from './types/context.js';
import type { HttpGetService } from './services/http-get-service/http-get-service.js';
import type { CacheService } from './services/cache-service/cache-service.js';

/** Default {@link HttpGetService}. Memoized per process (stateless adapter). */
export function defaultHttpGetService(): HttpGetService {
  if (!cachedHttp) {
    cachedHttp = BuiltinHttpGetService();
  }
  return cachedHttp;
}

/**
 * Construct the default {@link CacheService} — a fresh
 * `InMemoryCacheService` on every call.
 *
 * Each `createVerifier()` invocation that doesn't pass an explicit
 * `cacheService` therefore owns an isolated in-memory cache. To share
 * cache state across verifiers, construct one `InMemoryCacheService`
 * (or any `CacheService` adapter) and pass it as
 * `createVerifier({ cacheService })` to each verifier.
 */
export function createDefaultCacheService(): CacheService {
  return InMemoryCacheService();
}

/**
 * Default crypto suites: Ed25519Signature2020 + EdDSA/RDFC 2022 +
 * ECDSA/RDFC 2019.
 *
 * Three suites cover the proofs seen in the wild: the older Linked Data
 * Proof (Ed25519-2020) and the newer Data Integrity Proofs (EdDSA
 * RDFC-2022 and ECDSA RDFC-2019, the latter for P-256/P-384 Multikey).
 */
export function defaultCryptoSuites(): CryptoSuite[] {
  if (!cachedCryptoSuites) {
    cachedCryptoSuites = [
      new Ed25519Signature2020(),
      new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite }),
      new DataIntegrityProof({ cryptosuite: ecdsaRdfc2019 })
    ];
  }
  return cachedCryptoSuites;
}

/** Default {@link CryptoService} stack — one Data Integrity adapter using {@link defaultCryptoSuites}. */
export function defaultCryptoServices(): CryptoService[] {
  if (!cachedCryptoServices) {
    cachedCryptoServices = [
      DataIntegrityCryptoService({ suites: defaultCryptoSuites() })
    ];
  }
  return cachedCryptoServices;
}

/**
 * Build a {@link DocumentLoader} for the given {@link HttpGetService}.
 *
 * Always derives the loader via {@link documentLoaderFromHttpGet} so
 * every remote fetch (JSON-LD contexts, did:web docs, status list
 * credentials) flows through the verifier's cached HTTP service.
 *
 * Per-service loaders are memoized via a module-local `WeakMap` keyed
 * on the `HttpGetService` instance: the default service is itself
 * memoized, so its loader persists for the process; caller-provided
 * services map to one entry each, GC'd when the caller drops the
 * reference. The standalone `verifyCredential` / `verifyPresentation`
 * wrappers (which build a fresh verifier per call) reuse the same
 * loader for the default service via this map — no per-call
 * `CachedResolver` / did-driver re-allocation.
 */
export function defaultDocumentLoaderFor(
  httpGetService: HttpGetService
): DocumentLoader {
  const cached = documentLoaderByHttpGetService.get(httpGetService);
  if (cached !== undefined) {
    return cached;
  }
  const loader = documentLoaderFromHttpGet(httpGetService);
  documentLoaderByHttpGetService.set(httpGetService, loader);
  return loader;
}

let cachedHttp: HttpGetService | undefined;
let cachedCryptoSuites: CryptoSuite[] | undefined;
let cachedCryptoServices: CryptoService[] | undefined;
const documentLoaderByHttpGetService = new WeakMap<
  HttpGetService,
  DocumentLoader
>();
