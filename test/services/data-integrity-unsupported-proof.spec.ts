/**
 * The Data Integrity crypto service reports a proof it could not check —
 * no registered suite supports it, or it was made for another purpose —
 * as `PROOF_UNSUPPORTED`, saying which of the two it was, rather than as
 * a bad signature.
 *
 * Runs offline with real signatures, the way
 * `credential-validity-dates.spec.ts` does: `did:key` resolves from the
 * identifier itself, every `@context` is bundled in
 * `@digitalcredentials/security-document-loader`, and the
 * `httpGetService` throws if anything reaches for the network.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { issue } from '@digitalcredentials/vc';
import {
  defaultCryptoSuites,
  defaultDocumentLoaderFor
} from '../../src/default-services.js';
import { DataIntegrityCryptoService } from '../../src/services/data-integrity-crypto.js';
import { ProblemTypes } from '../../src/problem-types.js';
import type { CryptoResult } from '../../src/types/crypto-service.js';
import type { HttpGetService } from '../../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../../src/types/http.js';
import { DidKeySigners } from '../factories/data/did-key-signers.js';

const offlineHttpGetService: HttpGetService = {
  async get(url: string): Promise<HttpGetResult> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const bundledLoader = defaultDocumentLoaderFor(offlineHttpGetService);

const service = DataIntegrityCryptoService({ suites: defaultCryptoSuites() });
const options = { documentLoader: bundledLoader };

function onlyProblem(result: CryptoResult) {
  expect(result.verified).toBe(false);
  if (result.verified) {
    return undefined;
  }
  expect(result.problems).toHaveLength(1);
  return result.problems[0];
}

describe('DataIntegrityCryptoService: proofs it cannot check', () => {
  let signed: Record<string, unknown>;
  let signedProof: Record<string, unknown>;

  beforeAll(async () => {
    const signers = await DidKeySigners(31);

    signed = (await issue({
      credential: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://w3id.org/security/data-integrity/v2'
        ],
        id: 'urn:uuid:data-integrity-unsupported-proof',
        type: ['VerifiableCredential'],
        issuer: signers.issuerDid,
        validFrom: '2020-01-01T00:00:00Z',
        credentialSubject: { id: 'did:example:subject' }
      },
      suite: signers.eddsaRdfc2022(),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;
    signedProof = signed.proof as Record<string, unknown>;
  });

  it('verifies the credential as signed', async () => {
    expect(await service.verifyCredential(signed, options)).toEqual({
      verified: true,
      message: 'Signature verified successfully.'
    });
  });

  it('names the cryptosuite when no registered suite supports it', async () => {
    const problem = onlyProblem(
      await service.verifyCredential(
        { ...signed, proof: { ...signedProof, cryptosuite: 'bbs-2023' } },
        options
      )
    );
    expect(problem).toEqual({
      type: ProblemTypes.PROOF_UNSUPPORTED,
      title: 'Unsupported Proof',
      detail: "This verifier does not support this proof's cryptosuite."
    });
  });

  it('names the purpose when a supported proof was made for another one', async () => {
    const problem = onlyProblem(
      await service.verifyCredential(
        {
          ...signed,
          proof: { ...signedProof, proofPurpose: 'authentication' }
        },
        options
      )
    );
    expect(problem?.type).toBe(ProblemTypes.PROOF_UNSUPPORTED);
    expect(problem?.detail).toBe(
      "This proof's purpose (authentication) is not the one being checked (assertionMethod)."
    );
  });

  it('uses a general wording when several proofs went unchecked', async () => {
    const problem = onlyProblem(
      await service.verifyCredential(
        {
          ...signed,
          proof: [
            { ...signedProof, cryptosuite: 'bbs-2023' },
            { ...signedProof, proofPurpose: 'authentication' }
          ]
        },
        options
      )
    );
    expect(problem?.type).toBe(ProblemTypes.PROOF_UNSUPPORTED);
    expect(problem?.detail).toBe(
      'No proof in this document could be checked: none uses a cryptosuite this verifier supports with the expected proof purpose.'
    );
  });

  it("reports a presentation's unsupported proof the same way", async () => {
    const problem = onlyProblem(
      await service.verifyPresentation(
        {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://w3id.org/security/data-integrity/v2'
          ],
          type: ['VerifiablePresentation'],
          proof: {
            ...signedProof,
            cryptosuite: 'bbs-2023',
            proofPurpose: 'authentication'
          }
        },
        options
      )
    );
    expect(problem?.detail).toBe(
      "This verifier does not support this proof's cryptosuite."
    );
  });

  it('still reports a tampered proof as INVALID_SIGNATURE', async () => {
    const problem = onlyProblem(
      await service.verifyCredential(
        { ...signed, credentialSubject: { id: 'did:example:someone-else' } },
        options
      )
    );
    expect(problem?.type).toBe(ProblemTypes.INVALID_SIGNATURE);
  });
});
