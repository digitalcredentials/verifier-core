/**
 * Verification context — the composition seam between core logic and external services.
 *
 * Every check receives a `VerificationContext`. It carries injected services
 * (document loader, plain JSON fetch, crypto) and configuration (registries, challenge).
 * Built internally by `createVerifier(...)` from a {@link VerifierConfig}.
 *
 * In hexagonal terms, this is where adapters (concrete implementations) are
 * assembled and handed to the core domain. The core never imports concrete
 * dependencies directly — it reads them from the context.
 */

import type { CacheService } from '../services/cache-service/cache-service.js';
import type { CryptoService } from './crypto-service.js';
import type { HttpGetService } from '../services/http-get-service/http-get-service.js';
import type { TimeService } from '../services/time-service/time-service.js';
import type { EntityIdentityRegistry, LookupIssuers } from './registry.js';
import type { RecognizerSpec } from './recognition.js';

/**
 * Resolves a URL to a JSON-LD document (or other linked resource).
 *
 * This is a port interface — the default implementation uses
 * `@digitalcredentials/security-document-loader` with cached contexts,
 * but callers can inject any loader (e.g. one that reads from a fixture map
 * in tests).
 */
export type DocumentLoader = (url: string) => Promise<unknown>;

/**
 * Fetches a plain JSON document by URL — no JSON-LD envelope.
 *
 * Used for resources that are not JSON-LD (e.g. JSON Schema for OBv3 AJV, and in the
 * future OIDF entity configs, OIDC discovery, JWKS). Kept separate from
 * {@link DocumentLoader} because JSON-LD loaders wrap results in
 * `{ contextUrl, document, documentUrl }` and use different fetch semantics.
 */
export type FetchJson = (url: string) => Promise<unknown>;

/**
 * Shared resources and configuration available to all verification checks.
 *
 * Built by `createVerifier(...)` from a caller-provided `VerifierConfig`.
 */
export interface VerificationContext {
  documentLoader: DocumentLoader;
  fetchJson: FetchJson;
  /**
   * Optional unified HTTP GET service (e.g. cached). When set without explicit
   * {@link documentLoader} / {@link fetchJson}, those are derived from this.
   */
  httpGetService?: HttpGetService;
  /**
   * Optional cache service for domain-level storage (registry handlers, etc.).
   */
  cacheService?: CacheService;
  /**
   * Pluggable crypto verification services (Data Integrity today; JWT / others later).
   * Governs proof verification for presentations, credentials, and the
   * BitstringStatusListCredentials fetched during a status check. The proof
   * suite and the status suite both dispatch to the first service whose
   * `canVerify(subject)` is true.
   */
  cryptoServices: CryptoService[];
  registries?: EntityIdentityRegistry[];
  /**
   * Optional issuer registry lookup. When omitted, the registry check uses the default
   * adapter.
   */
  lookupIssuers?: LookupIssuers;
  /** Expected challenge for VP authentication proof purpose. */
  challenge?: string | null;
  /** Whether to allow unsigned presentations (skip VP signature check). */
  unsignedPresentation?: boolean;
  /**
   * Pluggable credential recognizers. Threaded through from
   * {@link VerifierConfig.recognizers} so the built-in
   * `recognitionSuite` can iterate them without depending on the
   * verifier factory directly.
   */
  recognizers?: RecognizerSpec[];
  /**
   * Pluggable wall-clock + monotonic clock. Required at
   * runtime — `createVerifier(...)` populates a default
   * {@link RealTimeService} when no override is supplied on
   * {@link VerifierConfig}. Marked optional here only so test
   * factories that build a {@link VerificationContext}
   * directly remain backward-compatible during the rollout
   * of timing instrumentation; production code paths must
   * always set it.
   *
   * @see ../services/time-service/time-service.ts
   */
  timeService?: TimeService;
  /**
   * When true, every `CheckResult` produced under this
   * context carries `timing`, and top-level / suite-level
   * timing rolls up. Resolved by `createVerifier(...)` from
   * `VerifierConfig.timing` and per-call overrides; checks
   * never read this directly — only `runSuites` and
   * `verifier.ts` do.
   */
  timing?: boolean;
}
