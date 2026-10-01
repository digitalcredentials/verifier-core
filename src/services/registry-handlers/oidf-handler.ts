import type { OidfEntityIdentityRegistry } from '../../types/registry.js';
import type { CacheService } from '../cache-service/cache-service.js';
import type { HttpGetService } from '../http-get-service/http-get-service.js';
import { parseCacheControlMaxAge, resolveTtl } from './cache-ttl.js';
import { jwtDecodePayload } from './jwt-payload-decode.js';
import type {
  HandlerResult,
  RegistryHandler,
  RegistryHandlerContext
} from './types.js';

/**
 * OIDF trust-anchor lookup: entity configuration JWT, then federation fetch
 * for the issuer DID (JWT payload decode only; no signature verification).
 */
export const lookupOidf: RegistryHandler = async (did, registry, ctx) => {
  if (registry.type !== 'oidf') {
    return { status: 'unchecked', registryName: registry.name };
  }
  return lookupOidfForRegistry(did, registry, ctx);
};

async function lookupOidfForRegistry(
  did: string,
  registry: OidfEntityIdentityRegistry,
  { httpGetService, cacheService }: RegistryHandlerContext
): Promise<HandlerResult> {
  const ecJwt = await getOrLoadEntityConfigJwt(
    registry.trustAnchorEC,
    httpGetService,
    cacheService
  );
  if (!ecJwt) {
    return { status: 'unchecked', registryName: registry.name };
  }

  let entityDecoded: unknown;
  try {
    entityDecoded = jwtDecodePayload(ecJwt);
  } catch {
    return { status: 'unchecked', registryName: registry.name };
  }

  const fetchEndpoint = getFederationFetchEndpoint(entityDecoded);
  if (!fetchEndpoint) {
    return { status: 'unchecked', registryName: registry.name };
  }

  const lookupUrl = `${fetchEndpoint}?sub=${encodeURIComponent(did)}`;
  const lookupKey = cacheKeyForOidfLookup(lookupUrl);

  const cachedIssuerJwt = (await cacheService.get(lookupKey)) as
    | string
    | undefined;
  if (cachedIssuerJwt) {
    return issuerJwtToResult(cachedIssuerJwt, registry.name);
  }

  let result;
  try {
    result = await httpGetService.get(lookupUrl);
  } catch {
    return { status: 'unchecked', registryName: registry.name };
  }

  if (result.status === 404) {
    return { status: 'not-found' };
  }
  if (result.status < 200 || result.status >= 300) {
    return { status: 'unchecked', registryName: registry.name };
  }

  const issuerJwt =
    typeof result.body === 'string' ? result.body : String(result.body ?? '');
  if (!issuerJwt) {
    return { status: 'unchecked', registryName: registry.name };
  }

  const parsed = issuerJwtToResult(issuerJwt, registry.name);
  if (parsed.status !== 'found') {
    return parsed;
  }

  const ttlMs = resolveTtl(parseCacheControlMaxAge(result.headers));
  await cacheService.set(lookupKey, issuerJwt, ttlMs);
  return { status: 'found', registryName: registry.name };
}

async function getOrLoadEntityConfigJwt(
  trustAnchorEcUrl: string,
  httpGetService: HttpGetService,
  cacheService: CacheService
): Promise<string | null> {
  const key = cacheKeyForOidfEntityConfig(trustAnchorEcUrl);
  const cached = (await cacheService.get(key)) as string | undefined;
  if (cached) {
    return cached;
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
  if (!jwt) {
    return null;
  }

  try {
    const decoded = jwtDecodePayload(jwt);
    if (!getFederationFetchEndpoint(decoded)) {
      return null;
    }
  } catch {
    return null;
  }

  const ttlMs = resolveTtl(parseCacheControlMaxAge(result.headers));
  await cacheService.set(key, jwt, ttlMs);
  return jwt;
}

function issuerJwtToResult(
  issuerJwt: string,
  registryName: string
): HandlerResult {
  try {
    const decoded = jwtDecodePayload(issuerJwt);
    if (!hasIssuerMetadata(decoded)) {
      return { status: 'unchecked', registryName };
    }
  } catch {
    return { status: 'unchecked', registryName };
  }
  return { status: 'found', registryName };
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

function hasIssuerMetadata(decoded: unknown): boolean {
  const metadata = (decoded as { metadata?: unknown }).metadata;
  return metadata !== null && typeof metadata === 'object';
}

function cacheKeyForOidfEntityConfig(trustAnchorEcUrl: string): string {
  return `oidf:ec:${trustAnchorEcUrl}`;
}

function cacheKeyForOidfLookup(lookupUrl: string): string {
  return `oidf:lookup:${lookupUrl}`;
}
