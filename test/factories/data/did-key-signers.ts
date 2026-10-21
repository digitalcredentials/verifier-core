/**
 * Signing suites for offline real-signature tests: one `did:key` issuer
 * that signs with both `Ed25519Signature2020` and `DataIntegrityProof` +
 * `eddsa-rdfc-2022`, as `status-list-cryptosuite-parity.spec.ts` does.
 * `did:key` resolves from the identifier itself, so verifying needs no
 * network.
 */

import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey';

// The package ships no type declarations, and the ones TypeScript infers
// from its JavaScript give `generate` no parameters; it takes a seed.
const generateMultikey = Ed25519Multikey.generate as unknown as (options: {
  seed: Uint8Array;
  controller: string;
  id: string;
}) => ReturnType<typeof Ed25519Multikey.generate>;

export interface DidKeySigners {
  issuerDid: string;
  /** A new `Ed25519Signature2020` suite for each signature. */
  ed25519Signature2020: () => InstanceType<typeof Ed25519Signature2020>;
  /** A new `DataIntegrityProof` + `eddsa-rdfc-2022` suite for each signature. */
  eddsaRdfc2022: () => InstanceType<typeof DataIntegrityProof>;
}

/** Both suites for the `did:key` derived from a seed filled with `seedByte`. */
export async function DidKeySigners(seedByte: number): Promise<DidKeySigners> {
  const seed = new Uint8Array(32).fill(seedByte);
  const key = await Ed25519VerificationKey2020.generate({ seed });
  const issuerDid = `did:key:${key.fingerprint()}`;
  key.controller = issuerDid;
  key.id = `${issuerDid}#${key.fingerprint()}`;

  const multiKey = await generateMultikey({
    seed,
    controller: issuerDid,
    id: key.id
  });

  return {
    issuerDid,
    ed25519Signature2020: () => new Ed25519Signature2020({ key }),
    eddsaRdfc2022: () =>
      new DataIntegrityProof({
        signer: multiKey.signer(),
        cryptosuite: eddsaRdfc2022CryptoSuite
      })
  };
}
