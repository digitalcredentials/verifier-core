import type { OidfEntityIdentityRegistry } from '../../types/registry.js';
import type { CacheService } from '../cache-service/cache-service.js';
import type { HttpGetService } from '../http-get-service/http-get-service.js';
import { parseCacheControlMaxAge, resolveTtl } from './cache-ttl.js';
import { verifyJws } from './jws-verify.js';
import { jwtDecodePayload } from './jwt-payload-decode.js';
import type {
  HandlerResult,
  RegistryHandler,
  RegistryHandlerContext
} from './types.js';

/**
 * OpenID Federation (OIDF) trust-anchor lookup.
 *
 * 1. Fetch the trust anchor's entity configuration from `trustAnchorEC` and
 *    verify it against its own `jwks`, with `iss === sub` and an unexpired
 *    `exp`. The federation fetch endpoint is read only from that verified
 *    payload.
 * 2. Fetch the issuer's subordinate statement from that endpoint and verify
 *    it against the anchor's keys, with `iss` equal to the anchor's entity
 *    identifier, `sub` equal to the issuer DID, and an unexpired `exp`.
 *
 * Trust is rooted in the HTTPS fetch of the configured `trustAnchorEC`: there
 * are no pinned anchor keys, so the entity configuration is trusted because
 * of where it was fetched from, and everything else follows from its keys.
 *
 * Only the raw JWTs are cached, never a verdict, and each is re-verified on
 * every cache hit and never cached past its `exp`. A 404 from the fetch
 * endpoint is `not-found`; every other failure, including any failed check,
 * is `unchecked`, because it says nothing about whether the issuer is a
 * member.
 */
export const lookupOidf: RegistryHandler = async (did, registry, ctx) => {
  if (registry.type !== 'oidf') {
    return { status: 'unchecked', registryName: registry.name };
  }
  return lookupOidfForRegistry(did, registry, ctx);
};

/** The parts of a verified entity configuration the lookup needs. */
type VerifiedEntityConfiguration = {
  /** The anchor's entity identifier (its `sub`), which may be a DID, not the URL. */
  entityId: string;
  jwks: unknown;
  fetchEndpoint: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
};

async function lookupOidfForRegistry(
  did: string,
  registry: OidfEntityIdentityRegistry,
  { httpGetService, cacheService }: RegistryHandlerContext
): Promise<HandlerResult> {
  const unchecked: HandlerResult = {
    status: 'unchecked',
    registryName: registry.name
  };

  const ec = await getVerifiedEntityConfiguration(
    registry.trustAnchorEC,
    httpGetService,
    cacheService
  );
  if (!ec) {
    return unchecked;
  }

  // Built with URL so an endpoint that already carries a query keeps it.
  let lookupUrl: string;
  try {
    const url = new URL(ec.fetchEndpoint);
    url.searchParams.set('sub', did);
    lookupUrl = url.href;
  } catch {
    return unchecked;
  }
  const lookupKey = cacheKeyForOidfLookup(lookupUrl);

  const cached = await cacheService.get(lookupKey);
  if (typeof cached === 'string' && cached) {
    if (await verifySubordinateStatement(cached, ec, did)) {
      return { status: 'found', registryName: registry.name };
    }
    // A cached statement that no longer verifies (typically one past its
    // `exp`) is refetched rather than trusted.
  }

  let result;
  try {
    result = await httpGetService.get(lookupUrl);
  } catch {
    return unchecked;
  }

  if (result.status === 404) {
    return { status: 'not-found' };
  }
  if (result.status < 200 || result.status >= 300) {
    return unchecked;
  }

  const issuerJwt =
    typeof result.body === 'string' ? result.body : String(result.body ?? '');
  const verified = await verifySubordinateStatement(issuerJwt, ec, did);
  if (!verified) {
    return unchecked;
  }

  await cacheService.set(
    lookupKey,
    issuerJwt,
    ttlBoundedByExp(result.headers, verified.exp)
  );
  return { status: 'found', registryName: registry.name };
}

/**
 * The trust anchor's verified entity configuration, from the cache or a
 * fresh fetch, or `null` when it cannot be fetched or does not verify.
 * Only a JWT that verifies is cached.
 */
async function getVerifiedEntityConfiguration(
  trustAnchorEcUrl: string,
  httpGetService: HttpGetService,
  cacheService: CacheService
): Promise<VerifiedEntityConfiguration | null> {
  const key = cacheKeyForOidfEntityConfig(trustAnchorEcUrl);
  const cached = await cacheService.get(key);
  if (typeof cached === 'string' && cached) {
    const ec = await verifyEntityConfiguration(cached);
    if (ec) {
      return ec;
    }
    // Fall through to a fresh fetch: the cached copy has expired or no
    // longer verifies.
  }

  let result;
  try {
    result = await httpGetService.get(trustAnchorEcUrl);
  } catch {
    return null;
  }
  if (result.status < 200 || result.status >= 300) {
    return null;
  }

  const jwt =
    typeof result.body === 'string' ? result.body : String(result.body ?? '');
  const ec = await verifyEntityConfiguration(jwt);
  if (!ec) {
    return null;
  }

  await cacheService.set(key, jwt, ttlBoundedByExp(result.headers, ec.exp));
  return ec;
}

/**
 * Verify a self-signed entity configuration: its signature against the
 * `jwks` it carries, `iss === sub`, an unexpired `exp`, and a federation
 * fetch endpoint. Returns `null` on any failure.
 */
async function verifyEntityConfiguration(
  jwt: string
): Promise<VerifiedEntityConfiguration | null> {
  // The configuration is self-signed, so its keys come from the statement
  // itself. Reading them before verification is safe: if the payload was
  // altered, the signature over it fails.
  let unverified: unknown;
  try {
    unverified = jwtDecodePayload(jwt);
  } catch {
    return null;
  }
  const result = await verifyJws(
    jwt,
    (unverified as { jwks?: unknown } | null)?.jwks
  );
  if (!result.valid) {
    return null;
  }

  const { iss, sub, jwks } = result.payload;
  const exp = unexpiredNumericDate(result.payload.exp);
  if (typeof iss !== 'string' || iss !== sub || exp === undefined) {
    return null;
  }
  const fetchEndpoint = getFederationFetchEndpoint(result.payload);
  if (!fetchEndpoint) {
    return null;
  }
  return { entityId: iss, jwks, fetchEndpoint, exp };
}

/**
 * Verify a subordinate statement for `did`: signed by one of the anchor's
 * keys, issued by the anchor's entity identifier, about `did`, unexpired,
 * and carrying a `metadata` object. Returns its `exp`, or `null` on any
 * failure.
 */
async function verifySubordinateStatement(
  jwt: string,
  ec: VerifiedEntityConfiguration,
  did: string
): Promise<{ exp: number } | null> {
  const result = await verifyJws(jwt, ec.jwks);
  if (!result.valid) {
    return null;
  }
  const { iss, sub, metadata } = result.payload;
  const exp = unexpiredNumericDate(result.payload.exp);
  if (iss !== ec.entityId || sub !== did || exp === undefined) {
    return null;
  }
  if (metadata === null || typeof metadata !== 'object') {
    return null;
  }
  return { exp };
}

/**
 * `exp` as seconds since the epoch, when it is in the future; otherwise
 * `undefined`. A string of decimal digits is accepted as well as a number:
 * the spec requires a number, but a live registry (OpenSALT) signs `exp` as
 * a digit string, and the value is covered by the signature either way.
 */
function unexpiredNumericDate(exp: unknown): number | undefined {
  const seconds =
    typeof exp === 'string' && /^\d+$/.test(exp) ? Number(exp) : exp;
  return typeof seconds === 'number' && seconds * 1000 > Date.now()
    ? seconds
    : undefined;
}

/**
 * Cache TTL from `Cache-Control` (or the default), but never past the
 * statement's own `exp`.
 */
function ttlBoundedByExp(headers: Headers, exp: number): number {
  return Math.min(
    resolveTtl(parseCacheControlMaxAge(headers)),
    exp * 1000 - Date.now()
  );
}

function getFederationFetchEndpoint(decoded: unknown): string | undefined {
  const endpoint = (
    decoded as {
      metadata?: { federation_entity?: { federation_fetch_endpoint?: string } };
    }
  )?.metadata?.federation_entity?.federation_fetch_endpoint;
  return typeof endpoint === 'string' && endpoint.length > 0
    ? endpoint
    : undefined;
}

function cacheKeyForOidfEntityConfig(trustAnchorEcUrl: string): string {
  return `oidf:ec:${trustAnchorEcUrl}`;
}

function cacheKeyForOidfLookup(lookupUrl: string): string {
  return `oidf:lookup:${lookupUrl}`;
}
