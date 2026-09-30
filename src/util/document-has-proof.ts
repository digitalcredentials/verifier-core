/**
 * Whether a credential or presentation carries a proof object.
 *
 * Shared by the Data Integrity adapter's `canVerify` and by `signatureCheck`,
 * so "has a proof" means the same thing when choosing a crypto service and
 * when deciding whether a presentation is unsigned.
 */
export function documentHasProof(
  doc: Record<string, unknown> | undefined
): boolean {
  if (!doc) {
    return false;
  }
  const proof = doc.proof;
  if (proof === undefined || proof === null) {
    return false;
  }
  if (Array.isArray(proof)) {
    return (
      proof.length > 0 && typeof proof[0] === 'object' && proof[0] !== null
    );
  }
  return typeof proof === 'object';
}
