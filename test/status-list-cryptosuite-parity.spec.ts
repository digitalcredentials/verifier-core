/**
 * Acceptance evidence for status-list cryptosuite parity: the
 * `cryptoServices` injected into `createVerifier` are the only set that
 * governs BitstringStatusListCredential proof verification.
 *
 * Runs offline with real signatures. `did:key` resolves from the identifier
 * itself and every `@context` used here is bundled in
 * `@digitalcredentials/security-document-loader`. The `httpGetService` throws
 * if anything reaches for the network.
 *
 * Pairing: the status list is signed with `Ed25519Signature2020`; the
 * subject credential is signed with `eddsa-rdfc-2022` so its proof is
 * verifiable under both service sets. The only variable between (a) and
 * (b) is whether the injected set includes `Ed25519Signature2020`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { issue } from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey';
import {
  createCredential,
  createList
} from '@digitalcredentials/vc-bitstring-status-list';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import { DataIntegrityCryptoService } from '../src/services/data-integrity-crypto.js';
import { ProblemTypes } from '../src/problem-types.js';
import type { DocumentLoader } from '../src/types/context.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../src/types/http.js';
import { BitstringStatusEntry } from './factories/data/index.js';

const STATUS_LIST_URL = 'https://factory.test/status/parity-list';
const FOREIGN_STATUS_LIST_URL = 'https://factory.test/status/foreign-list';
const EXPIRED_STATUS_LIST_URL = 'https://factory.test/status/expired-list';
const REVOKED_STATUS_LIST_URL = 'https://factory.test/status/revoked-list';
const FOREIGN_REVOKED_STATUS_LIST_URL =
  'https://factory.test/status/foreign-revoked-list';
const FOREIGN_EXPIRED_STATUS_LIST_URL =
  'https://factory.test/status/foreign-expired-list';

const offlineHttpGetService: HttpGetService = {
  async get(url: string): Promise<HttpGetResult> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const bundledLoader = defaultDocumentLoaderFor(offlineHttpGetService);

function subjectTemplate(
  issuerDid: string,
  statusListUrl: string
): Record<string, unknown> {
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/data-integrity/v2'
    ],
    id: 'urn:uuid:status-list-cryptosuite-parity-subject',
    type: ['VerifiableCredential'],
    issuer: issuerDid,
    validFrom: '2020-01-01T00:00:00Z',
    credentialSubject: { id: 'did:example:subject' },
    credentialStatus: BitstringStatusEntry({
      statusListCredential: statusListUrl,
      statusListIndex: '0',
      statusPurpose: 'revocation'
    })
  };
}

describe('status list cryptosuite parity', () => {
  let signedStatusList: Record<string, unknown>;
  let signedSubject: Record<string, unknown>;
  let signedForeignStatusList: Record<string, unknown>;
  let signedSubjectWithForeignList: Record<string, unknown>;
  let foreignDid: string;
  let signedSubjectWithExpiredList: Record<string, unknown>;
  let signedExpiredSubjectWithRevokedList: Record<string, unknown>;
  let signedSubjectWithForeignRevokedList: Record<string, unknown>;
  let signedSubjectWithForeignExpiredList: Record<string, unknown>;
  let documentLoader: DocumentLoader;

  beforeAll(async () => {
    const seed = new Uint8Array(32).fill(11);
    const key = await Ed25519VerificationKey2020.generate({ seed });
    const issuerDid = `did:key:${key.fingerprint()}`;
    key.controller = issuerDid;
    key.id = `${issuerDid}#${key.fingerprint()}`;

    const multiKey = await Ed25519Multikey.generate({
      seed,
      controller: issuerDid,
      id: `${issuerDid}#${key.fingerprint()}`
    });

    const list = await createList({ length: 32 });
    const unsignedList = (await createCredential({
      id: STATUS_LIST_URL,
      list,
      statusPurpose: 'revocation'
    })) as Record<string, unknown>;
    unsignedList.issuer = issuerDid;
    unsignedList.validFrom = '2020-01-01T00:00:00Z';
    const listContext = unsignedList['@context'];
    unsignedList['@context'] = [
      ...(Array.isArray(listContext) ? listContext : [listContext]),
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ];

    // vc's `issue` adds the proof to the object it is given. Sign copies,
    // so the lists spread from these templates carry only their own proof.
    signedStatusList = (await issue({
      credential: { ...unsignedList },
      suite: new Ed25519Signature2020({ key }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    signedSubject = (await issue({
      credential: subjectTemplate(issuerDid, STATUS_LIST_URL),
      suite: new DataIntegrityProof({
        signer: multiKey.signer(),
        cryptosuite: eddsaRdfc2022CryptoSuite
      }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    // A validly signed list from a different DID than the subject's issuer.
    const foreignKey = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(12)
    });
    foreignDid = `did:key:${foreignKey.fingerprint()}`;
    foreignKey.controller = foreignDid;
    foreignKey.id = `${foreignDid}#${foreignKey.fingerprint()}`;
    const unsignedForeignList = {
      ...unsignedList,
      id: FOREIGN_STATUS_LIST_URL,
      issuer: foreignDid,
      credentialSubject: {
        ...(unsignedList.credentialSubject as Record<string, unknown>),
        id: `${FOREIGN_STATUS_LIST_URL}#list`
      }
    };
    signedForeignStatusList = (await issue({
      credential: { ...unsignedForeignList },
      suite: new Ed25519Signature2020({ key: foreignKey }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    signedSubjectWithForeignList = (await issue({
      credential: subjectTemplate(issuerDid, FOREIGN_STATUS_LIST_URL),
      suite: new DataIntegrityProof({
        signer: multiKey.signer(),
        cryptosuite: eddsaRdfc2022CryptoSuite
      }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    // A list from the subject's issuer whose validity has ended. vc's
    // `issue` does not check dates, so it signs without complaint.
    const signedExpiredStatusList = (await issue({
      credential: {
        ...unsignedList,
        id: EXPIRED_STATUS_LIST_URL,
        validUntil: '2021-01-01T00:00:00Z',
        credentialSubject: {
          ...(unsignedList.credentialSubject as Record<string, unknown>),
          id: `${EXPIRED_STATUS_LIST_URL}#list`
        }
      },
      suite: new Ed25519Signature2020({ key }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    signedSubjectWithExpiredList = (await issue({
      credential: subjectTemplate(issuerDid, EXPIRED_STATUS_LIST_URL),
      suite: new DataIntegrityProof({
        signer: multiKey.signer(),
        cryptosuite: eddsaRdfc2022CryptoSuite
      }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    const signSubject = async (
      statusListUrl: string,
      overrides: Record<string, unknown> = {}
    ) =>
      (await issue({
        credential: {
          ...subjectTemplate(issuerDid, statusListUrl),
          ...overrides
        },
        suite: new DataIntegrityProof({
          signer: multiKey.signer(),
          cryptosuite: eddsaRdfc2022CryptoSuite
        }),
        documentLoader: bundledLoader
      })) as Record<string, unknown>;

    // A list with the subject's index (0) set, signed by `signingKey` as
    // `signerDid`, optionally already expired.
    const signRevokedList = async (
      url: string,
      signerDid: string,
      signingKey: typeof key,
      overrides: Record<string, unknown> = {}
    ) => {
      const revokedList = await createList({ length: 32 });
      revokedList.setStatus(0, true);
      const unsigned = (await createCredential({
        id: url,
        list: revokedList,
        statusPurpose: 'revocation'
      })) as Record<string, unknown>;
      unsigned.issuer = signerDid;
      unsigned.validFrom = '2020-01-01T00:00:00Z';
      unsigned['@context'] = unsignedList['@context'];
      return (await issue({
        credential: { ...unsigned, ...overrides },
        suite: new Ed25519Signature2020({ key: signingKey }),
        documentLoader: bundledLoader
      })) as Record<string, unknown>;
    };

    const signedRevokedStatusList = await signRevokedList(
      REVOKED_STATUS_LIST_URL,
      issuerDid,
      key
    );
    const signedForeignRevokedStatusList = await signRevokedList(
      FOREIGN_REVOKED_STATUS_LIST_URL,
      foreignDid,
      foreignKey
    );
    const signedForeignExpiredStatusList = (await issue({
      credential: {
        ...unsignedForeignList,
        id: FOREIGN_EXPIRED_STATUS_LIST_URL,
        validUntil: '2021-01-01T00:00:00Z',
        credentialSubject: {
          ...(unsignedList.credentialSubject as Record<string, unknown>),
          id: `${FOREIGN_EXPIRED_STATUS_LIST_URL}#list`
        }
      },
      suite: new Ed25519Signature2020({ key: foreignKey }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    // Revoked on its issuer's own list, and past its validUntil.
    signedExpiredSubjectWithRevokedList = await signSubject(
      REVOKED_STATUS_LIST_URL,
      { validUntil: '2021-01-01T00:00:00Z' }
    );
    signedSubjectWithForeignRevokedList = await signSubject(
      FOREIGN_REVOKED_STATUS_LIST_URL
    );
    signedSubjectWithForeignExpiredList = await signSubject(
      FOREIGN_EXPIRED_STATUS_LIST_URL
    );

    const lists: Record<string, Record<string, unknown>> = {
      [STATUS_LIST_URL]: signedStatusList,
      [FOREIGN_STATUS_LIST_URL]: signedForeignStatusList,
      [EXPIRED_STATUS_LIST_URL]: signedExpiredStatusList,
      [REVOKED_STATUS_LIST_URL]: signedRevokedStatusList,
      [FOREIGN_REVOKED_STATUS_LIST_URL]: signedForeignRevokedStatusList,
      [FOREIGN_EXPIRED_STATUS_LIST_URL]: signedForeignExpiredStatusList
    };
    documentLoader = async (url: string) => {
      if (url in lists) {
        return {
          contextUrl: null,
          document: lists[url],
          documentUrl: url
        };
      }
      return bundledLoader(url);
    };
  });

  const eddsaOnly = () =>
    DataIntegrityCryptoService({
      suites: [
        new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite })
      ]
    });

  const eddsaAndEd25519 = () =>
    DataIntegrityCryptoService({
      suites: [
        new Ed25519Signature2020(),
        new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite })
      ]
    });

  function verifierWith(cryptoServices: ReturnType<typeof eddsaOnly>[]) {
    return createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader,
      cryptoServices
    });
  }

  it('(a) fails status.bitstring with STATUS_LIST_SIGNATURE_ERROR when the injected set lacks the list credential suite', async () => {
    const result = await verifierWith([eddsaOnly()]).verifyCredential({
      credential: signedSubject,
      phases: ['cryptographic']
    });

    const statusResult = result.results.find(
      r => r.id === 'cryptographic.status.bitstring'
    );
    expect(statusResult, 'status.bitstring result present').toBeDefined();
    expect(statusResult?.outcome.status).toBe('failure');
    if (statusResult?.outcome.status === 'failure') {
      expect(statusResult.outcome.problems[0].type).toBe(
        ProblemTypes.STATUS_LIST_SIGNATURE_ERROR
      );
    }

    const proofResult = result.results.find(
      r => r.id === 'cryptographic.proof.signature'
    );
    expect(proofResult?.outcome.status).toBe('success');

    // The list's proof never verified, so its issuer claim is not compared.
    const issuerResult = result.results.find(
      r => r.id === 'cryptographic.status.list-issuer'
    );
    expect(issuerResult?.outcome.status).toBe('skipped');
  });

  it('(b) succeeds status.bitstring when the injected set includes the list credential suite', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedSubject,
      phases: ['cryptographic']
    });

    const statusResult = result.results.find(
      r => r.id === 'cryptographic.status.bitstring'
    );
    expect(statusResult, 'status.bitstring result present').toBeDefined();
    expect(statusResult?.outcome.status).toBe('success');
    expect(result.verified).toBe(true);

    const issuerResult = result.results.find(
      r => r.id === 'cryptographic.status.list-issuer'
    );
    expect(issuerResult?.outcome.status).toBe('success');
  });

  it('(c) warns, without failing verification, when a validly signed list comes from a different DID', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedSubjectWithForeignList,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
    const statusResult = result.results.find(
      r => r.id === 'cryptographic.status.bitstring'
    );
    expect(statusResult?.outcome.status).toBe('success');

    const issuerResult = result.results.find(
      r => r.id === 'cryptographic.status.list-issuer'
    );
    expect(issuerResult?.outcome.status).toBe('failure');
    if (issuerResult?.outcome.status === 'failure') {
      expect(issuerResult.outcome.problems[0].type).toBe(
        ProblemTypes.STATUS_LIST_ISSUER_MISMATCH
      );
      expect(issuerResult.outcome.problems[0].detail).toContain(foreignDid);
    }
  });

  it('(d) reports an authentic but expired list as STATUS_LIST_EXPIRED, not as a bad signature', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedSubjectWithExpiredList,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    const statusResult = result.results.find(
      r => r.id === 'cryptographic.status.bitstring'
    );
    expect(statusResult?.outcome.status).toBe('failure');
    if (statusResult?.outcome.status === 'failure') {
      expect(statusResult.outcome.problems[0].type).toBe(
        ProblemTypes.STATUS_LIST_EXPIRED
      );
      expect(statusResult.outcome.problems[0].detail).toContain(
        EXPIRED_STATUS_LIST_URL
      );
    }
  });

  const rowOf = (
    results: Awaited<
      ReturnType<ReturnType<typeof verifierWith>['verifyCredential']>
    >['results'],
    id: string
  ) => {
    const row = results.find(r => r.id === id);
    expect(row, `${id} result present`).toBeDefined();
    return row!;
  };
  const problemTypes = (row: ReturnType<typeof rowOf>) =>
    row.outcome.status === 'failure'
      ? row.outcome.problems.map(p => p.type)
      : [];

  it('(e) reports a revoked credential that has also expired as both, and still checks the list issuer and registry', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedExpiredSubjectWithRevokedList
    });

    expect(result.verified).toBe(false);
    expect(
      rowOf(result.results, 'cryptographic.proof.signature').outcome.status
    ).toBe('success');
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.proof.validity-period'))
    ).toEqual([ProblemTypes.CREDENTIAL_EXPIRED]);
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.status.bitstring'))
    ).toEqual([ProblemTypes.CREDENTIAL_REVOKED]);
    expect(
      rowOf(result.results, 'cryptographic.status.list-issuer').outcome.status
    ).toBe('success');
    const notRun = result.results.filter(
      r =>
        r.outcome.status === 'skipped' &&
        r.outcome.reason.startsWith('Not run:')
    );
    expect(notRun).toEqual([]);
    expect(result.results.some(r => r.suite === 'registry')).toBe(true);
    expect(
      result.summary
        .filter(s => s.fatalFailureAt !== undefined)
        .map(s => s.suite)
    ).toEqual(['proof', 'status']);
  });

  it('(f) reports a revocation on a list from a different DID as both a revocation and an issuer mismatch', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedSubjectWithForeignRevokedList,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.status.bitstring'))
    ).toEqual([ProblemTypes.CREDENTIAL_REVOKED]);
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.status.list-issuer'))
    ).toEqual([ProblemTypes.STATUS_LIST_ISSUER_MISMATCH]);
  });

  it('(h) still compares the issuer of an authentic but expired list from a different DID', async () => {
    const result = await verifierWith([eddsaAndEd25519()]).verifyCredential({
      credential: signedSubjectWithForeignExpiredList,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.status.bitstring'))
    ).toEqual([ProblemTypes.STATUS_LIST_EXPIRED]);
    expect(
      problemTypes(rowOf(result.results, 'cryptographic.status.list-issuer'))
    ).toEqual([ProblemTypes.STATUS_LIST_ISSUER_MISMATCH]);
  });
});
