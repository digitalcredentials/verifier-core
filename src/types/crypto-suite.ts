/**
 * Types for cryptographic suites and proof purposes used by the
 * `@digitalcredentials/vc` / `@digitalcredentials/jsonld-signatures` stack.
 *
 * These model the **verification contract only** — the surface that
 * `ProofSet.verify()` dispatches to. Signing-related methods (`createProof`,
 * `sign`, `update`) are intentionally excluded because this project is a
 * verifier, not an issuer.
 */

// ---------------------------------------------------------------------------
// Shared parameter shapes
// ---------------------------------------------------------------------------

/** Options passed to `suite.matchProof()` by `ProofSet`. */
export interface MatchProofOptions {
  proof: Record<string, unknown>;
  document: Record<string, unknown>;
  purpose?: unknown;
  documentLoader?: unknown;
}

/** Options passed to `suite.verifyProof()` by `ProofSet`. */
export interface VerifyProofOptions {
  proof: Record<string, unknown>;
  document: Record<string, unknown>;
  purpose?: unknown;
  documentLoader?: unknown;
  proofSet?: Array<Record<string, unknown>>;
}

/** Result returned from `suite.verifyProof()`. */
export interface VerifyProofResult {
  verified: boolean;
  error?: unknown;
  verificationMethod?: unknown;
}

// ---------------------------------------------------------------------------
// CryptoSuite — discriminated union
// ---------------------------------------------------------------------------

/**
 * A legacy Linked-Data-Signature suite (e.g. `Ed25519Signature2020`).
 *
 * Discriminated from `DataIntegritySuite` by `type` being a free-form string
 * rather than the literal `'DataIntegrityProof'`.
 */
export interface LinkedDataSuite {
  readonly type: string;
  matchProof: (options: MatchProofOptions) => Promise<boolean>;
  verifyProof: (options: VerifyProofOptions) => Promise<VerifyProofResult>;
}

/**
 * A Data-Integrity suite backed by a named cryptosuite module
 * (e.g. `eddsa-rdfc-2022`).
 *
 * Constructed as `new DataIntegrityProof({ cryptosuite })` where the
 * cryptosuite object supplies `createVerifier`, `name`, and
 * `requiredAlgorithm`.
 */
export interface DataIntegritySuite {
  readonly type: 'DataIntegrityProof';
  /** Cryptosuite algorithm identifier (e.g. `'eddsa-rdfc-2022'`). */
  readonly cryptosuite: string;
  /** Builds a verifier from a resolved verification method. */
  createVerifier: (options: {
    verificationMethod: Record<string, unknown>;
  }) => Promise<{
    algorithm: string;
    verify: (options: {
      data: Uint8Array;
      signature: Uint8Array;
    }) => Promise<boolean>;
  }>;
  matchProof: (options: MatchProofOptions) => Promise<boolean>;
  verifyProof: (options: VerifyProofOptions) => Promise<VerifyProofResult>;
}

/**
 * Any cryptographic suite accepted by `@digitalcredentials/vc` for
 * verification.
 *
 * This is a discriminated union on `type`:
 * - `DataIntegritySuite` when `type === 'DataIntegrityProof'`
 * - `LinkedDataSuite` for all other proof types
 */
export type CryptoSuite = LinkedDataSuite | DataIntegritySuite;

// ---------------------------------------------------------------------------
// ProofPurpose
// ---------------------------------------------------------------------------

/** Options passed to `purpose.match()` by `ProofSet`. */
export interface PurposeMatchOptions {
  document: Record<string, unknown>;
  documentLoader?: unknown;
}

/** Options passed to `purpose.validate()` by `ProofSet`. */
export interface PurposeValidateOptions {
  document: Record<string, unknown>;
  suite: CryptoSuite;
  verificationMethod: unknown;
  documentLoader?: unknown;
}

/**
 * A proof purpose used during verification to match and validate proofs.
 *
 * Instances are created from `@digitalcredentials/jsonld-signatures` purpose
 * classes (`AssertionProofPurpose`, `AuthenticationProofPurpose`, etc.) and
 * passed to `@digitalcredentials/vc` as the `purpose` / `presentationPurpose`
 * option.
 */
export interface ProofPurpose {
  /** The proof-purpose term (e.g. `'assertionMethod'`, `'authentication'`). */
  readonly term: string;

  /** Does this purpose apply to the given proof? */
  match: (
    proof: Record<string, unknown>,
    options: PurposeMatchOptions
  ) => Promise<boolean>;

  /**
   * After cryptographic verification succeeds, validate purpose-specific
   * constraints (timestamp delta, controller authorization, challenge, etc.).
   */
  validate: (
    proof: Record<string, unknown>,
    options: PurposeValidateOptions
  ) => Promise<{ valid: boolean; error?: unknown }>;
}
