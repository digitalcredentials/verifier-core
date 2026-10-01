/**
 * Cryptographic verification port — hexagonal adapter boundary for proof verification.
 *
 * Implementations wrap concrete libraries (e.g. `@digitalcredentials/vc` for Data
 * Integrity). The proof suite dispatches to `CryptoService` instances from
 * `VerificationContext` (phase 2).
 */

import type { DocumentLoader } from './context.js';
import type { ProblemDetail } from './problem-detail.js';
import type { VerificationSubject } from './subject.js';

/**
 * Outcome of a credential or presentation cryptographic verification.
 *
 * Failures carry pre-classified `ProblemDetail` entries (adapter-specific error mapping).
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
  unsignedPresentation?: boolean;
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
