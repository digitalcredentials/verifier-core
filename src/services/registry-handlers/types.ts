import type { CacheService } from '../cache-service/cache-service.js';
import type {
  EntityIdentityRegistry,
  RegistryEntity
} from '../../types/registry.js';
import type { HttpGetService } from '../http-get-service/http-get-service.js';
import type { Verifier } from '../../types/verifier.js';

/**
 * Outcome of looking up one issuer DID in a single registry entry.
 *
 * A `found` result may carry the registry's own record of the entity,
 * which the lookup passes through to the check's payload. A custom
 * handler that has such a record should return it.
 */
export type HandlerResult =
  | { status: 'found'; registryName: string; entity?: RegistryEntity }
  | { status: 'not-found' }
  | { status: 'unchecked'; registryName: string };

/**
 * Per-call context provided to every {@link RegistryHandler}.
 *
 * Threads the long-lived services and the parent {@link Verifier} so a
 * handler can recursively verify a credential (e.g. a Verifiable
 * Recognition Credential) using the same cache + crypto stack as the
 * parent call.
 */
export interface RegistryHandlerContext {
  httpGetService: HttpGetService;
  cacheService: CacheService;
  verifier: Verifier;
}

/**
 * Looks up a DID in one registry (fetch via {@link HttpGetService}, cache, parse — type-specific).
 */
export type RegistryHandler = (
  did: string,
  registry: EntityIdentityRegistry,
  ctx: RegistryHandlerContext
) => Promise<HandlerResult>;

/** Per-type handlers used by `createRegistryLookup`. */
export type RegistryHandlerMap = Record<
  EntityIdentityRegistry['type'],
  RegistryHandler
>;
