/**
 * Portable base64url and JWT payload decoding.
 *
 * These helpers decode only; they establish nothing about who signed a
 * token. Callers that need trust verify the signature with `verifyJws`
 * from `./jws-verify.js`. Decoding uses only `atob` and `TextDecoder`, so it
 * works in browsers and React Native as well as Node.
 */

/**
 * Decode base64url (RFC 4648 §5, padding optional) to bytes, portably.
 * Throws on input that is not valid base64url.
 */
export function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode one base64url segment as UTF-8 JSON. Throws on invalid base64url,
 * invalid UTF-8 or invalid JSON.
 */
export function decodeBase64UrlJson<T = unknown>(segment: string): T {
  const json = new TextDecoder('utf-8', { fatal: true }).decode(
    base64UrlToBytes(segment)
  );
  return JSON.parse(json) as T;
}

/**
 * Decode a JWT's payload segment without verifying its signature.
 * Throws if the token has no payload segment or the payload is not JSON.
 */
export const jwtDecodePayload = <T = unknown>(jwt: string): T => {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT: expected header and payload segments');
  }
  return decodeBase64UrlJson<T>(parts[1]);
};
