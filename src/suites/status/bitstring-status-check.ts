import { checkStatus } from '@digitalcredentials/vc-bitstring-status-list';
import {
  dispatchProofVerification,
  type CryptoDispatchResult
} from '../../crypto-dispatch.js';
import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import {
  VerificationContext,
  type DocumentLoader
} from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import {
  getStatusType,
  hasBitstringStatusList,
  loadStatusList,
  statusListCredentialUrls
} from './status-lists.js';

// Legacy status types that are skipped
const LEGACY_STATUS_TYPES: string[] = [
  'StatusList2021Entry',
  '1EdTechRevocationList'
];

// Error patterns from constants/external.ts
const NOT_FOUND_ERROR = 'NotFoundError';
const EXPIRED_ERROR = 'is after "validUntil"';
const STATUS_SIGNATURE_ERROR = 'Verification error';
const STATUS_TYPE_ERROR =
  'Status list credential type must include "BitstringStatusListCredential".';
const STATUS_NOT_YET_VALID_ERROR = 'is before "validFrom"';

const STATUS_LIST_SIGNATURE_TITLE = 'Status List Signature Error';

/**
 * Map a non-verified dispatch onto `STATUS_LIST_SIGNATURE_ERROR`.
 *
 * `no-service` is a failure, not a skip: `DataIntegrityCryptoService.canVerify`
 * returns false for a document with no proof, so an unsigned status list
 * lands here. Passing that through as success would silently accept lists
 * the previous `vcVerifyCredential` path rejected.
 */
function statusListProofProblems(
  dispatched: Exclude<CryptoDispatchResult, { kind: 'verified' }>
): ProblemDetail[] {
  switch (dispatched.kind) {
    case 'no-service':
      return [
        {
          type: ProblemTypes.STATUS_LIST_SIGNATURE_ERROR,
          title: STATUS_LIST_SIGNATURE_TITLE,
          detail:
            "No registered crypto service can verify the status list credential's proof (unsigned list, or suite missing from cryptoServices)."
        }
      ];
    case 'rejected':
      return [
        {
          type: ProblemTypes.STATUS_LIST_SIGNATURE_ERROR,
          title: STATUS_LIST_SIGNATURE_TITLE,
          detail: 'The status list credential signature could not be verified.'
        }
      ];
    case 'threw':
      return [
        {
          type: ProblemTypes.STATUS_LIST_SIGNATURE_ERROR,
          title: STATUS_LIST_SIGNATURE_TITLE,
          detail:
            dispatched.error instanceof Error
              ? dispatched.error.message
              : 'An unexpected error occurred during signature verification.'
        }
      ];
  }
}

/**
 * Serves already-fetched status list credentials so `checkStatus` does
 * not issue a second GET for the same URL. Anything else (JSON-LD
 * contexts, DID documents) delegates to the original loader.
 */
function preloadedLoader(
  loaded: Map<string, unknown>,
  delegate: DocumentLoader
): DocumentLoader {
  return async (url: string) => {
    if (loaded.has(url)) {
      return { document: loaded.get(url), documentUrl: url };
    }
    return delegate(url);
  };
}

/**
 * Classify status check error into ProblemDetail.
 */
function classifyStatusError(error: unknown): ProblemDetail[] {
  const err = error as {
    message?: string;
    cause?: { message?: string };
    name?: string;
  };
  const errorMessage = err?.message || String(error);
  const causeMessage = err?.cause?.message || '';

  // Not found error
  if (
    err?.name === NOT_FOUND_ERROR ||
    causeMessage.startsWith(NOT_FOUND_ERROR)
  ) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_NOT_FOUND,
        title: 'Status List Not Found',
        detail: errorMessage
      }
    ];
  }

  // Expired error
  if (
    causeMessage.includes(EXPIRED_ERROR) ||
    errorMessage.includes(EXPIRED_ERROR.toLowerCase())
  ) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_EXPIRED,
        title: 'Status List Expired',
        detail: 'The status list credential has expired.'
      }
    ];
  }

  // Signature verification error
  if (causeMessage.startsWith(STATUS_SIGNATURE_ERROR)) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_SIGNATURE_ERROR,
        title: 'Status List Signature Error',
        detail: 'The status list credential signature could not be verified.'
      }
    ];
  }

  // Type error
  if (causeMessage.startsWith(STATUS_TYPE_ERROR)) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_TYPE_ERROR,
        title: 'Status List Type Error',
        detail: STATUS_TYPE_ERROR
      }
    ];
  }

  // Not yet valid error
  if (causeMessage.includes(STATUS_NOT_YET_VALID_ERROR)) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_NOT_YET_VALID,
        title: 'Status List Not Yet Valid',
        detail: 'The status list credential is not yet valid.'
      }
    ];
  }

  // Generic status error
  return [
    {
      type: ProblemTypes.STATUS_LIST_ERROR,
      title: 'Status List Error',
      detail:
        errorMessage || 'An error occurred while checking credential status.'
    }
  ];
}

/**
 * Bitstring status list check for revocation/suspension status.
 *
 * This is a **fatal** check: if the verifier cannot conclude that the
 * credential is currently un-revoked and un-suspended (because the
 * status list is missing, has an invalid signature, is expired, has a
 * wrong type, or actually marks the credential as revoked or
 * suspended), the overall verification result is `verified: false`.
 *
 * Proof verification of each named BitstringStatusListCredential goes
 * through {@link dispatchProofVerification} against
 * `context.cryptoServices` — the same dispatch presentation and
 * credential proofs use; that is also where the list's validity dates
 * are checked. `@digitalcredentials/vc-bitstring-status-list` keeps
 * ownership of purpose matching, list type, bitstring decoding, and
 * index reading. Whether the list is issued by the credential's issuer
 * is reported separately, by the non-fatal `status.list-issuer` check.
 *
 * `statusSuite` is the sole owner of status verification; the proof
 * suite no longer performs an embedded status check (P-E, 2026-04-19).
 *
 * Skipped (and therefore non-failing) when:
 * - Credential has no `credentialStatus`.
 * - Status type is a legacy type (`StatusList2021Entry`,
 *   `1EdTechRevocationList`).
 */
export const bitstringStatusCheck: VerificationCheck = {
  id: 'status.bitstring',
  name: 'Bitstring Status Check',
  description:
    'Checks revocation and suspension status via BitstringStatusList.',
  fatal: true,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;

    if (!credential) {
      return {
        status: 'skipped',
        reason: 'No verifiable credential found in subject.'
      };
    }

    // Check if credential has any credentialStatus
    if (!credential.credentialStatus) {
      return {
        status: 'skipped',
        reason: 'Credential has no credentialStatus.'
      };
    }

    // Check for legacy status types that we skip
    const statusType = getStatusType(credential);
    if (statusType && LEGACY_STATUS_TYPES.includes(statusType)) {
      return {
        status: 'skipped',
        reason: `Legacy status type "${statusType}" is not checked.`
      };
    }

    // Check if it's a BitstringStatusListEntry
    if (!hasBitstringStatusList(credential)) {
      return {
        status: 'skipped',
        reason: `Status type "${String(statusType)}" is not BitstringStatusListEntry.`
      };
    }

    try {
      const urls = statusListCredentialUrls(credential);
      const loaded = new Map<string, unknown>();
      for (const url of urls) {
        const document = await loadStatusList(url, context);
        const dispatched = await dispatchProofVerification({
          services: context.cryptoServices,
          subject: { verifiableCredential: document },
          options: { documentLoader: context.documentLoader }
        });
        if (dispatched.kind !== 'verified') {
          return {
            status: 'failure',
            problems: statusListProofProblems(dispatched)
          };
        }
        loaded.set(url, document);
      }

      const statusResult = (await checkStatus({
        credential,
        documentLoader: preloadedLoader(loaded, context.documentLoader),
        verifyBitstringStatusListCredential: false,
        // Issuer binding is reported by the non-fatal `status.list-issuer`
        // check. The library's own comparison throws, which would make a list
        // signed by a separate status-service DID fatal, and real deployments
        // sign lists that way.
        verifyMatchingIssuers: false
      })) as { verified?: boolean; error?: unknown };

      if (statusResult.error !== undefined) {
        return {
          status: 'failure',
          problems: classifyStatusError(statusResult.error)
        };
      }

      if (statusResult.verified === true) {
        return {
          status: 'success',
          message: 'Credential status is valid (not revoked or suspended).'
        };
      }

      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.CREDENTIAL_REVOKED_OR_SUSPENDED,
            title: 'Credential Revoked or Suspended',
            detail:
              'The credential has been revoked or suspended according to the status list.'
          }
        ]
      };
    } catch (error) {
      const problems = classifyStatusError(error);
      return {
        status: 'failure',
        problems
      };
    }
  }
};
