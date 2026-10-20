/**
 * Cryptographic verification port — hexagonal adapter boundary for proof verification.
 *
 * Implementations wrap concrete libraries (e.g. `@digitalcredentials/vc` for Data
 * Integrity). The proof suite dispatches to `CryptoService` instances from
 * `VerificationContext`.
 */

import type { DocumentLoader } from './context.js';
import type { ProblemDetail } from './problem-detail.js';
import type { VerificationSubject } from './subject.js';

/**
 * Outcome of a credential or presentation cryptographic verification.
 *
 * Failures carry pre-classified `ProblemDetail` entries (adapter-specific error mapping).
 *
 * A crypto service reports `CREDENTIAL_EXPIRED` or
 * `CREDENTIAL_NOT_YET_VALID` only when the proof itself verified.
 * `proof.signature` treats a rejection made only of those problems as a
 * verified signature, and leaves the dates to `proof.validity-period`.
 */
export type CryptoResult =
  | { verified: true; message?: string }
  | { verified: false; problems: ProblemDetail[] };

/**
 * Options passed to crypto verification — mirrors the seams the DCC vc stack needs.
 */
export interface CryptoVerifyOptions {
  documentLoader: DocumentLoader;
  challenge?: string | null;
  domain?: string;
  /**
   * The moment to judge validity dates against (`validFrom` /
   * `validUntil`, `issuanceDate` / `expirationDate`). Supplied by the
   * calling check from {@link VerificationContext.timeService}, so a
   * credential's expiry and its status list's freshness are decided by
   * the same clock. Omitted means "now" as the adapter's library sees
   * it.
   */
  now?: Date;
}

/**
 * Pluggable cryptographic verification for one proof family (e.g. Data Integrity).
 */
export interface CryptoService {
  canVerify: (subject: VerificationSubject) => boolean;
  verifyCredential: (
    credential: unknown,
    options: CryptoVerifyOptions
  ) => Promise<CryptoResult>;
  verifyPresentation: (
    presentation: unknown,
    options: CryptoVerifyOptions
  ) => Promise<CryptoResult>;
}
