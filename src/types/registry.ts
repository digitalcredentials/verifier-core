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
 * A configured registry, as named in a lookup result or check payload.
 *
 * `url` is where the registry is read from: the list URL for `dcc-legacy`
 * and `vc-recognition`, and the trust anchor's entity configuration
 * (`trustAnchorEC`) for `oidf`.
 */
export interface RegistryReference {
  name: string;
  type: EntityIdentityRegistry['type'];
  url?: string;
}

/**
 * What a registry records about the issuer it matched.
 *
 * This is the registry's own description of the entity, not the
 * credential's description of itself, so it is the display name to
 * prefer: the credential cannot alter it.
 *
 * Only `dcc-legacy` populates this today; `oidf` and `vc-recognition`
 * matches carry no entity yet.
 */
export interface RegistryEntity {
  /** Organisation name as the registry records it. */
  name?: string;
  /** The entity's homepage, as the registry records it. */
  url?: string;
  /** URL of the entity's logo, as the registry records it. */
  logo?: string;
  /** The registry's entry for the entity, unmodified. */
  raw?: unknown;
}

/** One registry that listed the issuer, with what that registry knows about it. */
export interface RegistryMatch {
  registry: RegistryReference;
  entity?: RegistryEntity;
}

/**
 * Payload of the `registry.issuer` check's outcome, on success and on
 * failure — what the lookup found, as data. The check's `message` says
 * the same thing as display text; read it, not parse it.
 *
 * A lookup stops at the first registry that matches unless it is run
 * with `exhaustive`, so `matches` normally holds at most one entry.
 */
export interface RegistryCheckPayload {
  /** The registries that listed the issuer, in configured order. */
  matches: RegistryMatch[];
  /** The registries that could not be reached or did not answer usefully. */
  uncheckedRegistries: RegistryReference[];
}

/**
 * Normalized result of an issuer registry lookup (port output for `lookupIssuers`).
 */
export interface RegistryLookupResult extends RegistryCheckPayload {
  found: boolean;
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
