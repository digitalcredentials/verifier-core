import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey';
import * as EcdsaMultikey from '@interop/ecdsa-multikey';

type SigningKeyPair = {
  signer: () => { sign: (opts: { data: Uint8Array }) => Promise<Uint8Array> };
};

/** A freshly generated test key: the key pair and its public JWK. */
export type TestSigningKey = {
  alg: 'ES256' | 'EdDSA';
  kid: string;
  keyPair: SigningKeyPair;
  /** Public JWK, `kid` included. */
  jwk: Record<string, unknown>;
};

/** Generate an ES256 (P-256) or EdDSA (Ed25519) key with a public JWK. */
export async function generateSigningKey(
  alg: 'ES256' | 'EdDSA',
  kid = `${alg.toLowerCase()}-key`
): Promise<TestSigningKey> {
  if (alg === 'ES256') {
    const keyPair = await EcdsaMultikey.generate({ curve: 'P-256' });
    const jwk = await EcdsaMultikey.toJwk({ keyPair });
    return { alg, kid, keyPair, jwk: { ...jwk, kid } };
  }
  const keyPair = await Ed25519Multikey.generate();
  const jwk = await Ed25519Multikey.toJwk({ keyPair });
  return { alg, kid, keyPair, jwk: { ...jwk, kid } };
}

/** A JWK Set holding the given keys' public JWKs. */
export function jwkSet(...keys: TestSigningKey[]): { keys: unknown[] } {
  return { keys: keys.map(key => key.jwk) };
}

const base64url = (bytes: Uint8Array | string): string =>
  Buffer.from(bytes).toString('base64url');

/**
 * Sign `payload` as a compact JWS with `key`. The header defaults to
 * `{ alg: key.alg, kid: key.kid }`; `header` overrides or adds members.
 */
export async function signJws({
  key,
  payload,
  header = {}
}: {
  key: TestSigningKey;
  payload: unknown;
  header?: Record<string, unknown>;
}): Promise<string> {
  const encodedHeader = base64url(
    JSON.stringify({ alg: key.alg, kid: key.kid, ...header })
  );
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await key.keyPair
    .signer()
    .sign({ data: new TextEncoder().encode(signingInput) });
  return `${signingInput}.${base64url(signature)}`;
}

/** Seconds since the epoch, offset by `deltaSeconds`. */
export const epochSeconds = (deltaSeconds = 0): number =>
  Math.floor(Date.now() / 1000) + deltaSeconds;

const ONE_DAY_SECONDS = 24 * 60 * 60;

/** A trust anchor's self-describing entity configuration payload. */
export function entityConfigurationPayload({
  entityId,
  jwks,
  fetchEndpoint,
  exp = epochSeconds(ONE_DAY_SECONDS)
}: {
  entityId: string;
  jwks: unknown;
  fetchEndpoint: string;
  exp?: number;
}): Record<string, unknown> {
  return {
    iss: entityId,
    sub: entityId,
    iat: epochSeconds(),
    exp,
    jwks,
    metadata: {
      federation_entity: {
        name: 'Trust Anchor',
        federation_fetch_endpoint: fetchEndpoint
      }
    }
  };
}

/** A trust anchor's subordinate statement payload about `did`. */
export function subordinateStatementPayload({
  entityId,
  did,
  exp = epochSeconds(ONE_DAY_SECONDS)
}: {
  entityId: string;
  did: string;
  exp?: number;
}): Record<string, unknown> {
  return {
    iss: entityId,
    sub: did,
    iat: epochSeconds(),
    exp,
    metadata: { federation_entity: { organization_name: 'Issuer' } }
  };
}
