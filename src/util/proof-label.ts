/**
 * How a proof is named in a problem's `detail`: its `type`, plus its
 * `cryptosuite` when it has one, e.g. "DataIntegrityProof, eddsa-rdfc-2022".
 * Data Integrity proofs all share one `type`, so the cryptosuite is what
 * tells two of them apart.
 */
export function proofLabel(proof: unknown): string {
  const { type, cryptosuite } = (proof ?? {}) as {
    type?: unknown;
    cryptosuite?: unknown;
  };
  const typeName = typeof type === 'string' ? type : 'unknown proof type';
  return typeof cryptosuite === 'string'
    ? `${typeName}, ${cryptosuite}`
    : typeName;
}
