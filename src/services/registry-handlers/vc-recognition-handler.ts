import type {
  RegistryEntity,
  VcRecognitionEntityIdentityRegistry
} from '../../types/registry.js';
import type { HttpGetService } from '../http-get-service/http-get-service.js';
import { DEFAULT_TTL_MS, resolveTtl, ttlFromValidUntil } from './cache-ttl.js';
import type {
  HandlerResult,
  RegistryHandler,
  RegistryHandlerContext
} from './types.js';

/**
 * VerifiableRecognitionCredential registry: fetch the recognition VC,
 * verify its issuer + proof using the parent {@link Verifier}
 * (sharing the same cache + crypto stack), cache it for at most an hour,
 * or until `validUntil` if sooner, so revocation of the recognition
 * credential is re-checked, then check `credentialSubject` for `did`.
 *
 * The recursive call passes `registries: []` to skip the registry suite
 * for the recognition credential itself — that prevents infinite
 * recursion when the recognition VC's own issuer is also looked up
 * through a recognition registry.
 *
 * A match carries the recognised `credentialSubject` entry as its entity.
 * It is read only from a credential that has verified, on the fresh path
 * and on a cache hit alike, so it is always the recognition issuer's
 * signed description of the issuer.
 *
 * @see https://w3c.github.io/vc-recognition/
 */
export const lookupVcRecognition: RegistryHandler = async (
  did,
  registry,
  ctx
) => {
  if (registry.type !== 'vc-recognition') {
    return { status: 'unchecked', registryName: registry.name };
  }
  return lookupVcRecognitionForRegistry(did, registry, ctx);
};

async function lookupVcRecognitionForRegistry(
  did: string,
  registry: VcRecognitionEntityIdentityRegistry,
  ctx: RegistryHandlerContext
): Promise<HandlerResult> {
  const { httpGetService, cacheService, verifier } = ctx;
  const key = cacheKeyForVcRecognitionUrl(registry.url);
  let credential = (await cacheService.get(key)) as
    | Record<string, unknown>
    | undefined;

  if (!credential) {
    const loaded = await fetchRecognitionCredentialJson(
      registry.url,
      httpGetService
    );
    if (!loaded) {
      return { status: 'unchecked', registryName: registry.name };
    }

    const issuerId = getIssuerId(loaded);
    if (!issuerId || !registry.acceptedIssuers.includes(issuerId)) {
      return { status: 'unchecked', registryName: registry.name };
    }

    const verification = await verifier.verifyCredential({
      credential: loaded,
      registries: []
    });

    if (!verification.verified) {
      return { status: 'unchecked', registryName: registry.name };
    }

    const validUntil =
      typeof loaded.validUntil === 'string' ? loaded.validUntil : undefined;
    const ttlMs = Math.min(
      resolveTtl(ttlFromValidUntil(validUntil ?? '')),
      DEFAULT_TTL_MS
    );
    await cacheService.set(key, loaded, ttlMs);
    credential = loaded;
  }

  const entry = findSubjectEntry(credential, did);
  if (!entry) {
    return { status: 'not-found' };
  }
  return {
    status: 'found',
    registryName: registry.name,
    entity: entityFromEntry(entry)
  };
}

/**
 * The registry's record of the issuer, read from the recognised
 * `credentialSubject` entry: its name, homepage and logo as the entry
 * gives them, plus the whole entry, so a consumer can read fields this
 * shape does not name.
 *
 * Only members that are strings are named, because a recognition
 * credential's subject is arbitrary JSON-LD — a `name` may be a language
 * map, and is then readable only through `raw`.
 */
function entityFromEntry(entry: Record<string, unknown>): RegistryEntity {
  const entity: RegistryEntity = { raw: entry };
  if (typeof entry.name === 'string') {
    entity.name = entry.name;
  }
  if (typeof entry.url === 'string') {
    entity.url = entry.url;
  }
  if (typeof entry.logo === 'string') {
    entity.logo = entry.logo;
  }
  return entity;
}

function cacheKeyForVcRecognitionUrl(url: string): string {
  return `vc-recognition:${url}`;
}

async function fetchRecognitionCredentialJson(
  url: string,
  httpGetService: HttpGetService
): Promise<Record<string, unknown> | null> {
  let result;
  try {
    result = await httpGetService.get(url);
  } catch {
    return null;
  }
  if (result.status < 200 || result.status >= 300) {
    return null;
  }
  const json = result.body;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  return json as Record<string, unknown>;
}

function getIssuerId(credential: Record<string, unknown>): string | undefined {
  const issuer = credential.issuer;
  if (typeof issuer === 'string') {
    return issuer;
  }
  if (issuer && typeof issuer === 'object' && 'id' in issuer) {
    const id = (issuer as { id: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

/** The `credentialSubject` entry recognising `did`, if there is one. */
function findSubjectEntry(
  credential: Record<string, unknown>,
  did: string
): Record<string, unknown> | undefined {
  const subject = credential.credentialSubject;
  if (subject === undefined || subject === null) {
    return undefined;
  }
  const entries = Array.isArray(subject) ? subject : [subject];
  return entries.find(
    entry =>
      entry !== null &&
      typeof entry === 'object' &&
      (entry as { id?: unknown }).id === did
  ) as Record<string, unknown> | undefined;
}
