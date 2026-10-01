import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey';
import * as EcdsaMultikey from '@interop/ecdsa-multikey';
import { base64UrlToBytes, decodeBase64UrlJson } from './jwt-payload-decode.js';

/** Outcome of {@link verifyJws}: the verified payload, or why it failed. */
export type JwsResult =
  | { valid: true; payload: Record<string, unknown> }
  | { valid: false; reason: string };

type SupportedAlg = 'ES256' | 'EdDSA';

type Jwk = Record<string, unknown>;

/**
 * Verify a compact JWS against a JWK Set, using the key libraries the
 * verifier already ships (ES256 via `@interop/ecdsa-multikey`, EdDSA via
 * `@digitalcredentials/ed25519-multikey`), so it runs in Node, browsers and
 * React Native with no new dependency.
 *
 * Only keys whose `kid` matches the header are tried. If none matches,
 * every key compatible with `alg` is tried instead, because some live registries
 * (Credential Engine) sign with a header `kid` that names none of their
 * published keys. Never throws: every failure is a `{ valid: false }`.
 *
 * @param jws - Compact serialization, `header.payload.signature`.
 * @param jwks - A JWK Set (`{ keys: [...] }`); anything else fails.
 */
export async function verifyJws(
  jws: string,
  jwks: unknown
): Promise<JwsResult> {
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) {
    return { valid: false, reason: 'malformed JWS' };
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: unknown;
  let payload: unknown;
  let signature: Uint8Array;
  try {
    header = decodeBase64UrlJson(encodedHeader);
    payload = decodeBase64UrlJson(encodedPayload);
    signature = base64UrlToBytes(encodedSignature);
  } catch {
    return { valid: false, reason: 'malformed JWS' };
  }
  if (!isObject(header) || !isObject(payload)) {
    return { valid: false, reason: 'malformed JWS' };
  }

  const alg = header.alg;
  if (alg !== 'ES256' && alg !== 'EdDSA') {
    return { valid: false, reason: 'unsupported alg' };
  }

  const keys = jwkSetKeys(jwks);
  if (!keys) {
    return { valid: false, reason: 'no JWK Set' };
  }

  const byKid = keys.filter(key => key.kid === header.kid);
  const candidates = (byKid.length > 0 ? byKid : keys).filter(key =>
    isCompatible(key, alg)
  );

  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  for (const jwk of candidates) {
    try {
      if (await verifyWithJwk(alg, jwk, data, signature)) {
        return { valid: true, payload };
      }
    } catch {
      // A key the library cannot import is skipped, not fatal: another key
      // in the set may still verify.
    }
  }
  return { valid: false, reason: 'signature did not verify' };
}

async function verifyWithJwk(
  alg: SupportedAlg,
  jwk: Jwk,
  data: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  // Only the public members are passed, so a JWK Set that carelessly
  // includes a private `d` never has it imported.
  if (alg === 'ES256') {
    const keyPair = await EcdsaMultikey.fromJwk({
      jwk: {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y
      } as EcdsaMultikey.JWK
    });
    return keyPair.verifier().verify({ data, signature });
  }
  const keyPair = await Ed25519Multikey.fromJwk({
    jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }
  });
  return keyPair.verifier().verify({ data, signature });
}

function isCompatible(jwk: Jwk, alg: SupportedAlg): boolean {
  if (alg === 'ES256') {
    return jwk.kty === 'EC' && jwk.crv === 'P-256';
  }
  return jwk.kty === 'OKP' && jwk.crv === 'Ed25519';
}

function jwkSetKeys(jwks: unknown): Jwk[] | undefined {
  if (!isObject(jwks) || !Array.isArray(jwks.keys)) {
    return undefined;
  }
  return jwks.keys.filter(isObject);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
