import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { statusSuite } from '../../src/suites/status/index.js';
import { bitstringStatusCheck } from '../../src/suites/status/bitstring-status-check.js';
import { ProblemTypes } from '../../src/problem-types.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import type { DocumentLoader } from '../../src/types/context.js';
import type { CryptoService } from '../../src/types/crypto-service.js';
import {
  BitstringStatusEntry,
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID,
  StatusListCredentialFactory
} from '../factories/data/index.js';
import { FakeDocumentLoader } from '../factories/services/fake-document-loader.js';
import { FakeCryptoService } from '../factories/services/fake-crypto-service.js';

function countingDocumentLoader(inner: DocumentLoader): {
  loader: DocumentLoader;
  counts: Map<string, number>;
} {
  const counts = new Map<string, number>();
  return {
    counts,
    loader: async (url: string) => {
      counts.set(url, (counts.get(url) ?? 0) + 1);
      return inner(url);
    }
  };
}

function countingCryptoService(inner: CryptoService): {
  service: CryptoService;
  credentialCalls: number;
} {
  const box = { credentialCalls: 0 };
  return {
    get credentialCalls() {
      return box.credentialCalls;
    },
    service: {
      canVerify: subject => inner.canVerify(subject),
      verifyCredential: async (credential, options) => {
        box.credentialCalls += 1;
        return inner.verifyCredential(credential, options);
      },
      verifyPresentation: (presentation, options) =>
        inner.verifyPresentation(presentation, options)
    }
  };
}

describe('bitstringStatusCheck contract', () => {
  it('is fatal — a status failure flips overall verified to false', () => {
    expect(bitstringStatusCheck.fatal).toBe(true);
  });
});

describe('Status Suite', () => {
  const createSubject = (credential: unknown): VerificationSubject => ({
    verifiableCredential: credential
  });

  describe('credential with no credentialStatus', () => {
    it('skips check when credential has no status', async () => {
      const context = buildTestContext();
      const subject = createSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const results = await runSuites([statusSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('status.bitstring');
      expect(results[0].outcome.status).toBe('skipped');
      if (results[0].outcome.status === 'skipped') {
        expect(results[0].outcome.reason).toContain('no credentialStatus');
      }
    });
  });

  describe('credential with legacy status types', () => {
    it('skips check for StatusList2021Entry status type', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: {
            id: 'https://example.com/status#1',
            type: 'StatusList2021Entry',
            statusPurpose: 'revocation',
            statusListIndex: '1',
            statusListCredential: 'https://example.com/status'
          }
        }
      });
      const subject = createSubject(cred);
      const results = await runSuites(
        [statusSuite],
        subject,
        buildTestContext()
      );

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('skipped');
      if (results[0].outcome.status === 'skipped') {
        expect(results[0].outcome.reason).toContain('Legacy status type');
      }
    });

    it('skips check for 1EdTechRevocationList status type', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: {
            id: 'https://example.com/status#1',
            type: '1EdTechRevocationList',
            statusPurpose: 'revocation',
            statusListIndex: '1',
            statusListCredential: 'https://example.com/status'
          }
        }
      });
      const subject = createSubject(cred);
      const results = await runSuites(
        [statusSuite],
        subject,
        buildTestContext()
      );

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('skipped');
    });
  });

  describe('credential with BitstringStatusListEntry', () => {
    it('succeeds when index is not revoked (unsigned list credential)', async () => {
      const listUrl = 'https://factory.test/status/list-ok';
      const slCred = await StatusListCredentialFactory({
        id: listUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        revokedIndexes: [],
        listLength: 32
      });
      const documentLoader = FakeDocumentLoader({ [listUrl]: slCred });
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService()]
      });

      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: BitstringStatusEntry({
            statusListCredential: listUrl,
            statusListIndex: '0'
          })
        }
      });
      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('success');
      if (results[0].outcome.status === 'success') {
        expect(results[0].outcome.message).toContain('not revoked');
      }
    });

    it('fails when index is revoked', async () => {
      const listUrl = 'https://factory.test/status/list-revoked';
      const slCred = await StatusListCredentialFactory({
        id: listUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        revokedIndexes: [2],
        listLength: 32
      });
      const documentLoader = FakeDocumentLoader({ [listUrl]: slCred });
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService()]
      });

      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: BitstringStatusEntry({
            statusListCredential: listUrl,
            statusListIndex: '2'
          })
        }
      });
      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#CREDENTIAL_REVOKED_OR_SUSPENDED'
        );
      }
    });
  });

  describe('status list load failures', () => {
    it('fails when status list credential URL cannot be loaded', async () => {
      const listUrl = 'https://factory.test/status/missing';
      const documentLoader = FakeDocumentLoader({});
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService()]
      });

      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: BitstringStatusEntry({
            statusListCredential: listUrl,
            statusListIndex: '0'
          })
        }
      });
      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].detail).toMatch(
          /Could not load|Document not found|NotFoundError/i
        );
      }
    });
  });

  describe('status list proof via cryptoServices', () => {
    async function credentialWithHostedList(listUrl: string) {
      const slCred = await StatusListCredentialFactory({
        id: listUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        revokedIndexes: [],
        listLength: 32
      });
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: BitstringStatusEntry({
            statusListCredential: listUrl,
            statusListIndex: '0'
          })
        }
      });
      return {
        cred,
        documentLoader: FakeDocumentLoader({ [listUrl]: slCred })
      };
    }

    it('fails with STATUS_LIST_SIGNATURE_ERROR when the injected service rejects the list credential', async () => {
      const listUrl = 'https://factory.test/status/list-rejected';
      const { cred, documentLoader } = await credentialWithHostedList(listUrl);
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService({ verified: false })]
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.STATUS_LIST_SIGNATURE_ERROR
        );
        expect(results[0].outcome.problems[0].detail).toBe(
          'The status list credential signature could not be verified.'
        );
      }
    });

    it('fails with STATUS_LIST_SIGNATURE_ERROR when the injected service throws', async () => {
      const listUrl = 'https://factory.test/status/list-throws';
      const { cred, documentLoader } = await credentialWithHostedList(listUrl);
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [
          FakeCryptoService({ throwInVerify: new Error('boom from fixture') })
        ]
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.STATUS_LIST_SIGNATURE_ERROR
        );
        expect(results[0].outcome.problems[0].detail).toBe('boom from fixture');
      }
    });

    it('fails with STATUS_LIST_SIGNATURE_ERROR when no service can verify', async () => {
      const listUrl = 'https://factory.test/status/list-no-service';
      const { cred, documentLoader } = await credentialWithHostedList(listUrl);
      const context = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService({ canVerify: () => false })]
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.STATUS_LIST_SIGNATURE_ERROR
        );
      }
    });

    it('fails with STATUS_LIST_SIGNATURE_ERROR when cryptoServices is empty', async () => {
      const listUrl = 'https://factory.test/status/list-empty-services';
      const { cred, documentLoader } = await credentialWithHostedList(listUrl);
      const context = buildTestContext({
        documentLoader,
        cryptoServices: []
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.STATUS_LIST_SIGNATURE_ERROR
        );
      }
    });
  });

  describe('one fetch per distinct statusListCredential URL', () => {
    it('fetches and verifies each of two different list URLs once', async () => {
      const revocationUrl = 'https://factory.test/status/revocation';
      const suspensionUrl = 'https://factory.test/status/suspension';
      const revocationList = await StatusListCredentialFactory({
        id: revocationUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        statusPurpose: 'revocation',
        revokedIndexes: [],
        listLength: 32
      });
      const suspensionList = await StatusListCredentialFactory({
        id: suspensionUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        statusPurpose: 'suspension',
        revokedIndexes: [],
        listLength: 32
      });

      const { loader, counts } = countingDocumentLoader(
        FakeDocumentLoader({
          [revocationUrl]: revocationList,
          [suspensionUrl]: suspensionList
        })
      );
      const counted = countingCryptoService(FakeCryptoService());
      const context = buildTestContext({
        documentLoader: loader,
        cryptoServices: [counted.service]
      });

      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: [
            BitstringStatusEntry({
              statusListCredential: revocationUrl,
              statusListIndex: '0',
              statusPurpose: 'revocation'
            }),
            BitstringStatusEntry({
              statusListCredential: suspensionUrl,
              statusListIndex: '0',
              statusPurpose: 'suspension'
            })
          ]
        }
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('success');
      expect(counts.get(revocationUrl)).toBe(1);
      expect(counts.get(suspensionUrl)).toBe(1);
      expect(counted.credentialCalls).toBe(2);
    });

    it('fetches and verifies a shared list URL once for two entries', async () => {
      const listUrl = 'https://factory.test/status/shared';
      const slCred = await StatusListCredentialFactory({
        id: listUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        statusPurpose: 'revocation',
        revokedIndexes: [],
        listLength: 32
      });

      const { loader, counts } = countingDocumentLoader(
        FakeDocumentLoader({ [listUrl]: slCred })
      );
      const counted = countingCryptoService(FakeCryptoService());
      const context = buildTestContext({
        documentLoader: loader,
        cryptoServices: [counted.service]
      });

      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: [
            BitstringStatusEntry({
              statusListCredential: listUrl,
              statusListIndex: '0',
              statusPurpose: 'revocation',
              id: `${listUrl}#0`
            }),
            BitstringStatusEntry({
              statusListCredential: listUrl,
              statusListIndex: '1',
              statusPurpose: 'revocation',
              id: `${listUrl}#1`
            })
          ]
        }
      });

      const results = await runSuites(
        [statusSuite],
        createSubject(cred),
        context
      );

      expect(results[0].outcome.status).toBe('success');
      expect(counts.get(listUrl)).toBe(1);
      expect(counted.credentialCalls).toBe(1);
    });
  });

  describe('unknown status types', () => {
    it('skips check for unknown status type', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: {
            id: 'https://example.com/status#1',
            type: 'UnknownStatusType',
            statusPurpose: 'revocation'
          }
        }
      });
      const subject = createSubject(cred);
      const results = await runSuites(
        [statusSuite],
        subject,
        buildTestContext()
      );

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('skipped');
      if (results[0].outcome.status === 'skipped') {
        expect(results[0].outcome.reason).toContain('UnknownStatusType');
      }
    });
  });
});
