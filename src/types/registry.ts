/**
 * Issuer / entity identity registry configuration.
 *
 * Registries are lists of trusted issuer DIDs. During verification, the
 * registry suite checks whether the credential's issuer appears in any
 * configured registry. Three registry types are supported.
 *
 * Shape matches `@digitalcredentials/issuer-registry-client` for `oidf`
 * and `dcc-legacy`; `vc-recognition` follows the W3C VCs for Entity
 * Recognition draft (https://w3c.github.io/vc-recognition/).
 */

export interface BaseEntityIdentityRegistry {
  name: string;
  type: 'oidf' | 'dcc-legacy' | 'vc-recognition';
}

/**
 * OpenID Federation registry — uses a trust anchor entity configuration
 * endpoint to resolve trusted issuers.
 */
export interface OidfEntityIdentityRegistry extends BaseEntityIdentityRegistry {
  type: 'oidf';
  trustAnchorEC: string;
}

/**
 * DCC legacy registry — a static JSON file listing trusted issuer DIDs,
 * fetched from a URL.
 */
export interface DccLegacyEntityIdentityRegistry extends BaseEntityIdentityRegistry {
  type: 'dcc-legacy';
  url: string;
}

/**
 * VC Recognition registry — a URL pointing to a VerifiableRecognitionCredential
 * whose `credentialSubject` lists recognized entities (by DID).
 *
 * The credential is fetched, verified (proof + issuer match against
 * `acceptedIssuers`), and cached until its `validUntil` datetime.
 *
 * @see https://w3c.github.io/vc-recognition/
 */
export interface VcRecognitionEntityIdentityRegistry extends BaseEntityIdentityRegistry {
  type: 'vc-recognition';
  /** URL from which the VerifiableRecognitionCredential is fetched. */
  url: string;
  /**
   * Issuer DIDs/URLs trusted to issue this recognition credential.
   * Matched against `credential.issuer` (string) or `credential.issuer.id` (object).
   */
  acceptedIssuers: string[];
}

/** Discriminated union of supported registry types. */
export type EntityIdentityRegistry =
  | OidfEntityIdentityRegistry
  | DccLegacyEntityIdentityRegistry
  | VcRecognitionEntityIdentityRegistry;

/**
 * Normalized result of an issuer registry lookup (port output for `lookupIssuers`).
 */
export interface RegistryLookupResult {
  found: boolean;
  matchingRegistries: string[];
  uncheckedRegistries: string[];
}

/**
 * Options for {@link LookupIssuers}.
 */
export interface LookupIssuersOptions {
  /** When true, skip cached results and perform a fresh lookup. */
  fresh?: boolean;
  /** When true, check all registries even after finding a match. */
  exhaustive?: boolean;
}

/**
 * Looks up whether an issuer DID is registered in the configured registries.
 */
export type LookupIssuers = (
  did: string,
  registries: EntityIdentityRegistry[],
  options?: LookupIssuersOptions
) => Promise<RegistryLookupResult>;
