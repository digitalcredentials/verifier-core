/**
 * Catalog of `ProblemDetail.type` URIs emitted by built-in suites.
 *
 * Two provenance categories live alongside each other in the same
 * flat map:
 *
 * **Real spec types** — defined in W3C VC Data Model 2.0 §7.1
 * Verification (https://www.w3.org/TR/vc-data-model/#verification):
 *   - PARSING_ERROR
 *   - CRYPTOGRAPHIC_SECURITY_ERROR
 *   - MALFORMED_VALUE_ERROR
 *   - RANGE_ERROR
 *
 * Of those four, this catalog currently emits only PARSING_ERROR.
 * The other three are listed in the JSDoc above for awareness; we
 * may align synthesized tokens like INVALID_SIGNATURE onto
 * CRYPTOGRAPHIC_SECURITY_ERROR in a future deliberate refactor (out
 * of scope for P-D — see the design doc's non-goals).
 *
 * **Synthesized placeholders** — temporary URIs we use until the
 * W3C VC working group publishes a wider error registry or we adopt
 * our own URN namespace (see the readiness review's Q9 for the
 * decision history). They reuse the same
 * `https://www.w3.org/TR/vc-data-model#…` prefix as a stable string
 * but are NOT defined by the spec; treat them as opaque keys.
 *
 * `ProblemDetail.type` stays typed as `string` so callers can write
 * custom suites that emit their own problem URIs. `ProblemType`
 * (below) is a convenience union for callers that only branch on
 * built-in types.
 *
 * **Vertical / opt-in catalogs.** Problem types emitted by opt-in
 * verification submodules live in their own catalogs and are not
 * mirrored here. For example, OpenBadges types live in
 * `src/openbadges/problem-types.ts` and are exported via the
 * `@digitalcredentials/verifier-core/openbadges` submodule barrel as
 * `OpenBadgesProblemTypes`.
 */

export const ProblemTypes = {
  /** Spec — input could not be parsed. (W3C VC Data Model 2.0 §7.1) */
  PARSING_ERROR: 'https://www.w3.org/TR/vc-data-model#PARSING_ERROR',

  /** Synthesized — cryptographic signature did not verify. */
  INVALID_SIGNATURE: 'https://www.w3.org/TR/vc-data-model#INVALID_SIGNATURE',
  /** Synthesized — proof verification raised an error before reaching a verdict. */
  PROOF_VERIFICATION_ERROR:
    'https://www.w3.org/TR/vc-data-model#PROOF_VERIFICATION_ERROR',
  /** Synthesized — a `did:web` document could not be fetched. */
  DID_WEB_UNRESOLVED: 'https://www.w3.org/TR/vc-data-model#DID_WEB_UNRESOLVED',
  /** Synthesized — HTTP error during signature/issuer resolution. */
  HTTP_ERROR: 'https://www.w3.org/TR/vc-data-model#HTTP_ERROR',
  /** Synthesized — credential `id` is missing or malformed. */
  INVALID_CREDENTIAL_ID:
    'https://www.w3.org/TR/vc-data-model#INVALID_CREDENTIAL_ID',

  /** Synthesized — issuer DID was not found in any consulted registry. */
  ISSUER_NOT_FOUND: 'https://www.w3.org/TR/vc-data-model#ISSUER_NOT_FOUND',
  /** Synthesized — issuer DID was found but is not registered. */
  ISSUER_NOT_REGISTERED:
    'https://www.w3.org/TR/vc-data-model#ISSUER_NOT_REGISTERED',
  /** Synthesized — one or more registries could not be checked. */
  REGISTRY_UNCHECKED: 'https://www.w3.org/TR/vc-data-model#REGISTRY_UNCHECKED',
  /** Synthesized — registry lookup raised an error. */
  REGISTRY_ERROR: 'https://www.w3.org/TR/vc-data-model#REGISTRY_ERROR',

  /** Synthesized — schema validation failed. */
  SCHEMA_VALIDATION_FAILED:
    'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_FAILED',
  /** Synthesized — schema check raised an error before reaching a verdict. */
  SCHEMA_VALIDATION_ERROR:
    'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_ERROR',

  /** Synthesized — referenced status list could not be fetched. */
  STATUS_LIST_NOT_FOUND:
    'https://www.w3.org/TR/vc-data-model#STATUS_LIST_NOT_FOUND',
  /** Synthesized — referenced status list has expired. */
  STATUS_LIST_EXPIRED:
    'https://www.w3.org/TR/vc-data-model#STATUS_LIST_EXPIRED',
  /** Synthesized — status list VC signature did not verify. */
  STATUS_LIST_SIGNATURE_ERROR:
    'https://www.w3.org/TR/vc-data-model#STATUS_LIST_SIGNATURE_ERROR',
  /** Synthesized — status list VC type is unrecognized. */
  STATUS_LIST_TYPE_ERROR:
    'https://www.w3.org/TR/vc-data-model#STATUS_LIST_TYPE_ERROR',
  /** Synthesized — status list VC `validFrom` is in the future. */
  STATUS_LIST_NOT_YET_VALID:
    'https://www.w3.org/TR/vc-data-model#STATUS_LIST_NOT_YET_VALID',
  /** Synthesized — status list check raised an error before reaching a verdict. */
  STATUS_LIST_ERROR: 'https://www.w3.org/TR/vc-data-model#STATUS_LIST_ERROR',
  /** Synthesized — status list bit indicates revocation or suspension. */
  CREDENTIAL_REVOKED_OR_SUSPENDED:
    'https://www.w3.org/TR/vc-data-model#CREDENTIAL_REVOKED_OR_SUSPENDED'
} as const;

export type ProblemType = (typeof ProblemTypes)[keyof typeof ProblemTypes];
