/**
 * Decode a JWT payload segment (no signature verification).
 * Matches the approach used by `@digitalcredentials/issuer-registry-client`.
 */
export const jwtDecodePayload = <T = unknown>(jwt: string): T => {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT: expected header and payload segments');
  }
  const payload = parts[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
};
