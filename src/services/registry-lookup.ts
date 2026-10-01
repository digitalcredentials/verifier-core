/**
 * Issuer registry lookup via bundled handlers (DCC legacy, OIDF, VC recognition).
 * Includes DID-level result caching with short-circuit and fresh-lookup options.
 */

import type {
  EntityIdentityRegistry,
  LookupIssuers,
  LookupIssuersOptions,
  RegistryLookupResult
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
 * cache key that incorporates the DID and a canonicalized hash of the
 * registries array.
 *
 * Options:
 * - `fresh: true` — bypass the DID-level result cache (but underlying data caches still apply)
 * - `exhaustive: true` — check all registries even after finding a match (default: short-circuit on first found)
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
      if (cached) {
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

    const matchingRegistries: string[] = [];
    const uncheckedRegistries: string[] = [];

    for (const registry of registries) {
      const outcome = await handlers[registry.type](did, registry, ctx);
      if (outcome.status === 'found') {
        matchingRegistries.push(outcome.registryName);
        if (!options?.exhaustive) {
          break;
        }
      } else if (outcome.status === 'unchecked') {
        uncheckedRegistries.push(outcome.registryName);
      }
    }

    const result: RegistryLookupResult = {
      found: matchingRegistries.length > 0,
      matchingRegistries,
      uncheckedRegistries
    };

    await cacheService.set(cacheKey, result, DEFAULT_TTL_MS);

    return result;
  };
}
