/**
 * Extract credentials from a verifiable presentation.
 *
 * Returns an array of credentials, or null if no credentials are present.
 */
export function extractCredentialsFrom(vp: {
  verifiableCredential?: unknown | unknown[];
}): unknown[] | null {
  const { verifiableCredential } = vp;
  if (!verifiableCredential) {
    return null;
  }
  if (Array.isArray(verifiableCredential)) {
    return verifiableCredential.length > 0 ? verifiableCredential : null;
  }
  return [verifiableCredential];
}
