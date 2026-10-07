/**
 * Issuer registry lookup via bundled handlers (DCC legacy, OIDF, VC recognition).
 * Includes DID-level result caching with short-circuit and fresh-lookup options.
 */

import type {
  EntityIdentityRegistry,
  LookupIssuers,
  LookupIssuersOptions,
  RegistryLookupResult,
  RegistryMatch,
  RegistryReference
} from '../types/registry.js';
import type { Verifier } from '../types/verifier.js';
import type { CacheService } from './cache-service/cache-service.js';
import type { HttpGetService } from './http-get-service/http-get-service.js';
import { lookupDccLegacy } from './registry-handlers/dcc-legacy-handler.js';
import { lookupOidf } from './registry-handlers/oidf-handler.js';
import { lookupVcRecognition } from './registry-handlers/vc-recognition-handler.js';
import type {
  RegistryHandlerContext,
  RegistryHandlerMap
} from './registry-handlers/types.js';
import { registryKeyHash } from '../util/registry-key-hash.js';
import { DEFAULT_TTL_MS } from './registry-handlers/cache-ttl.js';

/**
 * A result missing some registries is retried soon, not trusted for an hour.
 * It is still cached briefly so that, while a registry is down, every
 * verification does not wait out the HTTP timeout again.
 */
const PARTIAL_RESULT_TTL_MS = 60 * 1000;

/**
 * The configured registry, as it is named in a lookup result. `oidf`
 * registries are identified by their trust anchor entity configuration;
 * the other two by the URL their list is read from.
 */
function registryReference(registry: EntityIdentityRegistry): RegistryReference {
  return {
    name: registry.name,
    type: registry.type,
    url: registry.type === 'oidf' ? registry.trustAnchorEC : registry.url
  };
}

const defaultHandlers: RegistryHandlerMap = {
  'dcc-legacy': lookupDccLegacy,
  oidf: lookupOidf,
  'vc-recognition': lookupVcRecognition
};

/**
 * Build a {@link LookupIssuers} using `httpGetService`, `cacheService`,
 * optional per-type `handlers`, and an optional `getVerifier` thunk.
 *
 * The `getVerifier` thunk is called per handler invocation to obtain
 * the parent {@link Verifier}, which is threaded through to handlers
 * via {@link RegistryHandlerContext} — required by the `vc-recognition`
 * handler so it can recursively verify the recognition credential. The
 * thunk indirection resolves the chicken-and-egg between
 * `createVerifier` (needs `lookupIssuers` for context) and
 * `createRegistryLookup` (wants the verifier for handlers): the verifier
 * is forward-declared in `createVerifier` and the thunk closes over the
 * mutable reference.
 *
 * If not provided, vc-recognition lookups will throw a clear error when
 * invoked. `dcc-legacy` and `oidf` handlers do not use the verifier and
 * work fine without one.
 *
 * The returned function caches lookup results at the DID level, using a
 * cache key that incorporates the DID and a canonical key for the
 * registries array. A complete result is cached for an hour; a result with
 * any unchecked registry is cached for only a minute, so a transient outage
 * is retried soon.
 *
 * Options:
 * - `fresh: true` — bypass the DID-level result cache (but underlying data caches still apply)
 * - `exhaustive: true` — check all registries even after finding a match (default: short-circuit on first found)
 *
 * Because the walk short-circuits, `matches` normally holds at most one
 * entry; only an `exhaustive` lookup can return more.
 */
export function createRegistryLookup(
  httpGetService: HttpGetService,
  cacheService: CacheService,
  handlers: RegistryHandlerMap = defaultHandlers,
  getVerifier?: () => Verifier
): LookupIssuers {
  return async (
    did: string,
    registries: EntityIdentityRegistry[],
    options?: LookupIssuersOptions
  ): Promise<RegistryLookupResult> => {
    const cacheKey = `reg-result:${did}:${registryKeyHash(registries)}`;

    if (!options?.fresh) {
      const cached = (await cacheService.get(cacheKey)) as
        | RegistryLookupResult
        | undefined;
      // A result cached by an earlier version, before `matches` existed, is
      // a cache miss rather than an error: look the issuer up again and
      // cache the current shape over it.
      if (cached && Array.isArray(cached.matches)) {
        return cached;
      }
    }

    const ctx: RegistryHandlerContext = {
      httpGetService,
      cacheService,
      get verifier(): Verifier {
        if (getVerifier === undefined) {
          throw new Error(
            'vc-recognition lookup invoked without a verifier in RegistryHandlerContext — ' +
              'use createVerifier() to construct a verifier that threads itself through.'
          );
        }
        return getVerifier();
      }
    };

    const matches: RegistryMatch[] = [];
    const uncheckedRegistries: RegistryReference[] = [];

    for (const registry of registries) {
      const outcome = await handlers[registry.type](did, registry, ctx);
      if (outcome.status === 'found') {
        matches.push({
          registry: registryReference(registry),
          ...(outcome.entity ? { entity: outcome.entity } : {})
        });
        if (!options?.exhaustive) {
          break;
        }
      } else if (outcome.status === 'unchecked') {
        uncheckedRegistries.push(registryReference(registry));
      }
    }

    const result: RegistryLookupResult = {
      found: matches.length > 0,
      matches,
      uncheckedRegistries
    };

    const ttl =
      result.uncheckedRegistries.length > 0
        ? PARTIAL_RESULT_TTL_MS
        : DEFAULT_TTL_MS;
    await cacheService.set(cacheKey, result, ttl);

    return result;
  };
}
