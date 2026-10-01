import type { DccLegacyEntityIdentityRegistry } from '../../types/registry.js';
import type { HttpGetService } from '../http-get-service/http-get-service.js';
import { parseCacheControlMaxAge, resolveTtl } from './cache-ttl.js';
import type {
  HandlerResult,
  RegistryHandler,
  RegistryHandlerContext
} from './types.js';

/**
 * DCC legacy registry JSON: a map of DID → issuer metadata under `registry`.
 *
 * @see https://digitalcredentials.github.io/sandbox-registry/registry.json
 */
export interface DccLegacyRegistryBody {
  registry: Record<
    string,
    { name?: string; url?: string; location?: string } | null
  >;
}

/**
 * Fetch a DCC legacy registry JSON file, cache by URL, and resolve whether `did`
 * appears in `body.registry`.
 */
export const lookupDccLegacy: RegistryHandler = async (did, registry, ctx) => {
  if (registry.type !== 'dcc-legacy') {
    return { status: 'unchecked', registryName: registry.name };
  }
  return lookupDccLegacyForRegistry(did, registry, ctx);
};

async function lookupDccLegacyForRegistry(
  did: string,
  registry: DccLegacyEntityIdentityRegistry,
  { httpGetService, cacheService }: RegistryHandlerContext
): Promise<HandlerResult> {
  const key = cacheKeyForDccLegacyUrl(registry.url);
  let body = (await cacheService.get(key)) as DccLegacyRegistryBody | undefined;

  if (!body) {
    const loaded = await fetchDccLegacyRegistry(registry, httpGetService);
    if (!loaded) {
      return { status: 'unchecked', registryName: registry.name };
    }
    body = loaded.body;
    await cacheService.set(key, body, loaded.ttlMs);
  }

  const entry = body.registry[did];
  if (entry === undefined || entry === null) {
    return { status: 'not-found' };
  }
  return { status: 'found', registryName: registry.name };
}

async function fetchDccLegacyRegistry(
  registry: DccLegacyEntityIdentityRegistry,
  httpGetService: HttpGetService
): Promise<{ body: DccLegacyRegistryBody; ttlMs: number } | null> {
  let result;
  try {
    result = await httpGetService.get(registry.url);
  } catch {
    return null;
  }
  if (result.status < 200 || result.status >= 300) {
    return null;
  }
  const json = result.body;
  if (!isDccLegacyRegistryBody(json)) {
    return null;
  }
  const ttlMs = resolveTtl(parseCacheControlMaxAge(result.headers));
  return { body: json, ttlMs };
}

function cacheKeyForDccLegacyUrl(url: string): string {
  return `dcc-legacy:${url}`;
}

function isDccLegacyRegistryBody(
  value: unknown
): value is DccLegacyRegistryBody {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const reg = (value as { registry?: unknown }).registry;
  return reg !== null && typeof reg === 'object' && !Array.isArray(reg);
}
