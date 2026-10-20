/**
 * Acceptance evidence that every proof in a proof set must verify (VC
 * Data Integrity §4.5): a credential, presentation or status list
 * credential signed with both `Ed25519Signature2020` and
 * `DataIntegrityProof` + `eddsa-rdfc-2022` fails when either proof is
 * broken, not only when both are. A proof this verifier cannot check
 * beside one that verified is a warning on `proof.unsupported-proofs`.
 *
 * Runs offline with real signatures, the way
 * `status-list-cryptosuite-parity.spec.ts` does: `did:key` resolves from
 * the identifier itself, every `@context` is bundled in
 * `@digitalcredentials/security-document-loader`, status lists are
 * served by the test's document loader, and the `httpGetService` throws
 * if anything reaches for the network.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createPresentation,
  issue,
  signPresentation
} from '@digitalcredentials/vc';
import jsonLdSignatures from '@digitalcredentials/jsonld-signatures';
import {
  createCredential,
  createList
} from '@digitalcredentials/vc-bitstring-status-list';
import { createVerifier } from '../src/verifier.js';
import {
  defaultCryptoServices,
  defaultDocumentLoaderFor
} from '../src/default-services.js';
import { ProblemTypes } from '../src/problem-types.js';
import type { CheckResult } from '../src/types/check.js';
import type { CryptoService } from '../src/types/crypto-service.js';
import type { DocumentLoader } from '../src/types/context.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../src/types/http.js';
import { BitstringStatusEntry } from './factories/data/index.js';
import {
  DidKeySigners,
  type DidKeySigners as Signers
} from './factories/data/did-key-signers.js';

const { purposes } = jsonLdSignatures;

const STATUS_LIST_URL = 'https://factory.test/status/proof-set-list';
const BROKEN_STATUS_LIST_URL =
  'https://factory.test/status/proof-set-list-broken';

const offlineHttpGetService: HttpGetService = {
  async get(url: string): Promise<HttpGetResult> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const bundledLoader = defaultDocumentLoaderFor(offlineHttpGetService);

const ED25519_LABEL = 'Ed25519Signature2020';
const EDDSA_LABEL = 'DataIntegrityProof, eddsa-rdfc-2022';

const NOT_RUN_AFTER_SIGNATURE = {
  status: 'skipped',
  reason: 'Not run: proof.signature failed'
};

const V2_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://w3id.org/security/suites/ed25519-2020/v1'
];

const V1_CONTEXT = [
  'https://www.w3.org/2018/credentials/v1',
  'https://w3id.org/security/suites/ed25519-2020/v1',
  'https://w3id.org/security/data-integrity/v2'
];

type Doc = Record<string, unknown>;

/**
 * Sign `document` with `Ed25519Signature2020`, then again with
 * `DataIntegrityProof` + `eddsa-rdfc-2022`. jsonld-signatures appends a
 * second proof to an existing one, so the result carries a set of two.
 */
async function signTwice(document: Doc, signers: Signers): Promise<Doc> {
  const once = (await issue({
    credential: { ...document },
    suite: signers.ed25519Signature2020(),
    documentLoader: bundledLoader
  })) as Doc;
  const twice = (await issue({
    credential: { ...once },
    suite: signers.eddsaRdfc2022(),
    documentLoader: bundledLoader
  })) as Doc;
  expect(twice.proof, 'signed with a set of two proofs').toHaveLength(2);
  return twice;
}

/**
 * `document` with the last character of proof `index`'s `proofValue`
 * replaced by another base58btc character, as issue #67 describes.
 */
function breakProof(document: Doc, index: number): Doc {
  const proofs = document.proof as Doc[];
  const value = proofs[index].proofValue as string;
  const broken = value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A');
  expect(broken).not.toBe(value);
  return {
    ...document,
    proof: proofs.map((proof, i) =>
      i === index ? { ...proof, proofValue: broken } : proof
    )
  };
}

function row(results: CheckResult[], id: string): CheckResult | undefined {
  const found = results.find(r => r.id === id);
  expect(found, `${id} result present`).toBeDefined();
  return found;
}

/** The `[type, detail]` of each problem on a failed row. */
function failureProblems(
  results: CheckResult[],
  id: string
): [string, string][] {
  const outcome = row(results, id)?.outcome;
  expect(outcome?.status).toBe('failure');
  return outcome?.status === 'failure'
    ? outcome.problems.map(p => [p.type, p.detail])
    : [];
}

describe('proof sets: every proof must verify', () => {
  let signers: Signers;
  let v2: Doc;
  let v2Expired: Doc;
  let v1: Doc;
  let singleProof: Doc;
  let presentation: Doc;
  let subjectWithList: Doc;
  let subjectWithBrokenList: Doc;
  let documentLoader: DocumentLoader;

  beforeAll(async () => {
    signers = await DidKeySigners(41);
    const issuer = signers.issuerDid;
    const credentialSubject = { id: 'did:example:subject' };

    v2 = await signTwice(
      {
        '@context': V2_CONTEXT,
        id: 'urn:uuid:proof-sets-v2',
        type: ['VerifiableCredential'],
        issuer,
        validFrom: '2020-01-01T00:00:00Z',
        credentialSubject
      },
      signers
    );

    v2Expired = await signTwice(
      {
        '@context': V2_CONTEXT,
        id: 'urn:uuid:proof-sets-v2-expired',
        type: ['VerifiableCredential'],
        issuer,
        validFrom: '2010-01-01T00:00:00Z',
        validUntil: '2011-01-01T00:00:00Z',
        credentialSubject
      },
      signers
    );

    v1 = await signTwice(
      {
        '@context': V1_CONTEXT,
        id: 'urn:uuid:proof-sets-v1',
        type: ['VerifiableCredential'],
        issuer,
        issuanceDate: '2020-01-01T00:00:00Z',
        credentialSubject
      },
      signers
    );

    singleProof = (await issue({
      credential: {
        '@context': V2_CONTEXT,
        id: 'urn:uuid:proof-sets-single',
        type: ['VerifiableCredential'],
        issuer,
        validFrom: '2020-01-01T00:00:00Z',
        credentialSubject
      },
      suite: signers.ed25519Signature2020(),
      documentLoader: bundledLoader
    })) as Doc;

    // A presentation whose own proof is a set of two, both made for
    // assertionMethod so that no challenge is needed to verify them.
    const unsignedPresentation = createPresentation({
      holder: issuer
    }) as Doc;
    unsignedPresentation['@context'] = [
      ...(unsignedPresentation['@context'] as string[]),
      'https://w3id.org/security/suites/ed25519-2020/v1',
      'https://w3id.org/security/data-integrity/v2'
    ];
    const presentedOnce = (await signPresentation({
      presentation: { ...unsignedPresentation },
      suite: signers.ed25519Signature2020(),
      purpose: new purposes.AssertionProofPurpose(),
      documentLoader: bundledLoader
    })) as Doc;
    presentation = (await signPresentation({
      presentation: { ...presentedOnce },
      suite: signers.eddsaRdfc2022(),
      purpose: new purposes.AssertionProofPurpose(),
      documentLoader: bundledLoader
    })) as Doc;
    expect(presentation.proof).toHaveLength(2);

    // Two status lists, each signed with both proofs; the second then has
    // its DataIntegrityProof broken.
    const signList = async (url: string) => {
      const unsigned = (await createCredential({
        id: url,
        list: await createList({ length: 32 }),
        statusPurpose: 'revocation'
      })) as Doc;
      const context = unsigned['@context'];
      return signTwice(
        {
          ...unsigned,
          '@context': [
            ...(Array.isArray(context) ? context : [context]),
            'https://w3id.org/security/suites/ed25519-2020/v1'
          ],
          issuer,
          validFrom: '2020-01-01T00:00:00Z'
        },
        signers
      );
    };
    const lists: Record<string, Doc> = {
      [STATUS_LIST_URL]: await signList(STATUS_LIST_URL),
      [BROKEN_STATUS_LIST_URL]: breakProof(
        await signList(BROKEN_STATUS_LIST_URL),
        1
      )
    };
    documentLoader = async (url: string) =>
      url in lists
        ? { contextUrl: null, document: lists[url], documentUrl: url }
        : bundledLoader(url);

    const subjectFor = async (statusListCredential: string) =>
      (await issue({
        credential: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://w3id.org/security/data-integrity/v2'
          ],
          id: `urn:uuid:proof-sets-subject-${statusListCredential.length}`,
          type: ['VerifiableCredential'],
          issuer,
          validFrom: '2020-01-01T00:00:00Z',
          credentialSubject,
          credentialStatus: BitstringStatusEntry({
            statusListCredential,
            statusListIndex: '0',
            statusPurpose: 'revocation'
          })
        },
        suite: signers.eddsaRdfc2022(),
        documentLoader: bundledLoader
      })) as Doc;
    subjectWithList = await subjectFor(STATUS_LIST_URL);
    subjectWithBrokenList = await subjectFor(BROKEN_STATUS_LIST_URL);
  });

  const verifier = (cryptoServices?: CryptoService[]) =>
    createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader,
      cryptoServices
    });

  const verifyCredential = (credential: Doc) =>
    verifier().verifyCredential({ credential, phases: ['cryptographic'] });

  describe("issue #67's table, v2 credential", () => {
    it('verifies when both proofs are valid', async () => {
      const result = await verifyCredential(v2);

      expect(result.verified).toBe(true);
      expect(
        row(result.results, 'cryptographic.proof.signature')?.outcome
      ).toEqual({
        status: 'success',
        message: 'Signature verified successfully.'
      });
    });

    it('fails when the DataIntegrityProof is broken, naming it', async () => {
      const result = await verifyCredential(breakProof(v2, 1));

      expect(result.verified).toBe(false);
      const problems = failureProblems(
        result.results,
        'cryptographic.proof.signature'
      );
      expect(problems).toHaveLength(1);
      expect(problems[0][0]).toBe(ProblemTypes.INVALID_SIGNATURE);
      expect(problems[0][1]).toMatch(
        new RegExp(`^Proof 2 of 2 \\(${EDDSA_LABEL}\\): `)
      );
    });

    it('fails when the Ed25519Signature2020 proof is broken, naming it', async () => {
      const result = await verifyCredential(breakProof(v2, 0));

      expect(result.verified).toBe(false);
      const problems = failureProblems(
        result.results,
        'cryptographic.proof.signature'
      );
      expect(problems).toHaveLength(1);
      expect(problems[0][0]).toBe(ProblemTypes.INVALID_SIGNATURE);
      expect(problems[0][1]).toMatch(
        new RegExp(`^Proof 1 of 2 \\(${ED25519_LABEL}\\): `)
      );
    });

    it('fails with a problem for each proof when both are broken', async () => {
      const result = await verifyCredential(breakProof(breakProof(v2, 0), 1));

      expect(result.verified).toBe(false);
      const problems = failureProblems(
        result.results,
        'cryptographic.proof.signature'
      );
      expect(problems.map(([type]) => type)).toEqual([
        ProblemTypes.INVALID_SIGNATURE,
        ProblemTypes.INVALID_SIGNATURE
      ]);
      expect(problems[0][1]).toMatch(/^Proof 1 of 2 /);
      expect(problems[1][1]).toMatch(/^Proof 2 of 2 /);
    });
  });

  describe('an expired credential with a proof set', () => {
    it('reports only the expiry when both proofs are valid', async () => {
      const result = await verifyCredential(v2Expired);

      expect(result.verified).toBe(false);
      expect(
        row(result.results, 'cryptographic.proof.signature')?.outcome.status
      ).toBe('success');
      expect(
        failureProblems(
          result.results,
          'cryptographic.proof.validity-period'
        ).map(([type]) => type)
      ).toEqual([ProblemTypes.CREDENTIAL_EXPIRED]);
    });

    it('reports the broken proof, not "verified, merely expired"', async () => {
      const result = await verifyCredential(breakProof(v2Expired, 1));

      expect(result.verified).toBe(false);
      const problems = failureProblems(
        result.results,
        'cryptographic.proof.signature'
      );
      expect(problems.map(([type]) => type)).toEqual([
        ProblemTypes.INVALID_SIGNATURE
      ]);
      expect(problems[0][1]).toMatch(/^Proof 2 of 2 /);
      expect(
        row(result.results, 'cryptographic.proof.validity-period')?.outcome
      ).toEqual(NOT_RUN_AFTER_SIGNATURE);
    });
  });

  describe('a v1 credential with a proof set', () => {
    it('verifies when both proofs are valid', async () => {
      expect((await verifyCredential(v1)).verified).toBe(true);
    });

    for (const [index, label] of [
      [0, ED25519_LABEL],
      [1, EDDSA_LABEL]
    ] as const) {
      it(`fails when proof ${index + 1} (${label}) is broken`, async () => {
        const result = await verifyCredential(breakProof(v1, index));

        expect(result.verified).toBe(false);
        const problems = failureProblems(
          result.results,
          'cryptographic.proof.signature'
        );
        expect(problems).toHaveLength(1);
        expect(problems[0][1]).toContain(
          `Proof ${index + 1} of 2 (${label}): `
        );
      });
    }
  });

  describe('a status list credential with a proof set', () => {
    it('accepts the list when both proofs are valid', async () => {
      const result = await verifyCredential(subjectWithList);

      expect(result.verified).toBe(true);
      expect(
        row(result.results, 'cryptographic.status.bitstring')?.outcome.status
      ).toBe('success');
    });

    it('treats a list with one broken proof as a bad list signature', async () => {
      const result = await verifyCredential(subjectWithBrokenList);

      expect(result.verified).toBe(false);
      expect(
        failureProblems(result.results, 'cryptographic.status.bitstring').map(
          ([type]) => type
        )
      ).toEqual([ProblemTypes.STATUS_LIST_SIGNATURE_ERROR]);
    });
  });

  describe("a presentation's own proof set", () => {
    it('verifies when both proofs are valid', async () => {
      const result = await verifier().verifyPresentation({ presentation });

      expect(
        row(result.presentationResults, 'cryptographic.proof.signature')
          ?.outcome.status
      ).toBe('success');
    });

    it('fails when one proof is broken', async () => {
      const result = await verifier().verifyPresentation({
        presentation: breakProof(presentation, 1)
      });

      expect(result.verified).toBe(false);
      const problems = failureProblems(
        result.presentationResults,
        'cryptographic.proof.signature'
      );
      expect(problems).toHaveLength(1);
      expect(problems[0][1]).toMatch(
        new RegExp(`^Proof 2 of 2 \\(${EDDSA_LABEL}\\): `)
      );
    });
  });

  it('verifies a single-proof credential as before', async () => {
    const result = await verifyCredential(singleProof);

    expect(result.verified).toBe(true);
    expect(
      row(result.results, 'cryptographic.proof.signature')?.outcome
    ).toEqual({
      status: 'success',
      message: 'Signature verified successfully.'
    });
  });

  describe('proofs this verifier cannot check', () => {
    const eddsaProof = () => (v2.proof as Doc[])[1];
    const ed25519Proof = () => (v2.proof as Doc[])[0];
    const UNSUPPORTED_ROW = 'cryptographic.proof.unsupported-proofs';

    it('warns about an unsupported cryptosuite beside a verified proof', async () => {
      const result = await verifyCredential({
        ...v2,
        proof: [eddsaProof(), { ...eddsaProof(), cryptosuite: 'bbs-2023' }]
      });

      expect(result.verified).toBe(true);
      expect(
        row(result.results, 'cryptographic.proof.signature')?.outcome.status
      ).toBe('success');
      expect(row(result.results, UNSUPPORTED_ROW)?.fatal).toBe(false);
      expect(failureProblems(result.results, UNSUPPORTED_ROW)).toEqual([
        [
          ProblemTypes.PROOF_UNSUPPORTED,
          "Proof 2 of 2 (DataIntegrityProof, bbs-2023): This verifier does not support this proof's cryptosuite."
        ]
      ]);
      expect(
        result.summary.find(s => s.suite === 'proof')?.fatalFailureAt
      ).toBeUndefined();
    });

    it('warns about a proof made for another purpose beside a verified proof', async () => {
      const result = await verifyCredential({
        ...v2,
        proof: [
          eddsaProof(),
          { ...ed25519Proof(), proofPurpose: 'authentication' }
        ]
      });

      expect(result.verified).toBe(true);
      expect(failureProblems(result.results, UNSUPPORTED_ROW)).toEqual([
        [
          ProblemTypes.PROOF_UNSUPPORTED,
          "Proof 2 of 2 (Ed25519Signature2020): This proof's purpose (authentication) is not the one being checked (assertionMethod)."
        ]
      ]);
    });

    it('fails the signature when the only proof is unsupported', async () => {
      const result = await verifyCredential({
        ...v2,
        proof: { ...eddsaProof(), cryptosuite: 'bbs-2023' }
      });

      expect(result.verified).toBe(false);
      expect(
        failureProblems(result.results, 'cryptographic.proof.signature').map(
          ([type]) => type
        )
      ).toEqual([ProblemTypes.PROOF_UNSUPPORTED]);
      expect(row(result.results, UNSUPPORTED_ROW)?.outcome).toEqual(
        NOT_RUN_AFTER_SIGNATURE
      );
    });

    it('reports every proof checked for a set of two supported proofs', async () => {
      const result = await verifyCredential(v2);

      expect(row(result.results, UNSUPPORTED_ROW)?.outcome).toEqual({
        status: 'success',
        message: 'Every proof was checked.'
      });
    });

    it('reports every proof checked for a single proof', async () => {
      const result = await verifyCredential(singleProof);

      expect(row(result.results, UNSUPPORTED_ROW)?.outcome).toEqual({
        status: 'success',
        message: 'Every proof was checked.'
      });
    });
  });

  it('asks the crypto service once per proof, for both proof checks together', async () => {
    const [service] = defaultCryptoServices();
    const seen: unknown[] = [];
    const counting: CryptoService = {
      ...service,
      verifyCredential: async (credential, options) => {
        seen.push((credential as Doc).proof);
        return service.verifyCredential(credential, options);
      }
    };

    const result = await verifier([counting]).verifyCredential({
      credential: v2,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen.every(proof => !Array.isArray(proof))).toBe(true);
  });
});
