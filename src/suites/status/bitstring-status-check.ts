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
import { findVcDateProblem } from '../../util/vc-date-messages.js';
import {
  checkedStatusEntries,
  checkedStatusListUrls,
  classifyIgnoredStatusEntry,
  credentialStatusEntries,
  describeIgnoredStatusEntry,
  ignoredStatusEntries,
  loadStatusList
} from './status-lists.js';

// Error patterns from constants/external.ts
const NOT_FOUND_ERROR = 'NotFoundError';
const STATUS_TYPE_ERROR =
  'Status list credential type must include "BitstringStatusListCredential".';

const STATUS_LIST_SIGNATURE_TITLE = 'Status List Signature Error';

type CheckStatusResult = {
  verified?: boolean;
  error?: unknown;
  results?: Array<{
    verified?: boolean;
    credentialStatus?: Record<string, unknown>;
  }>;
};

/**
 * Classify a crypto service's rejection of a status list credential.
 *
 * `@digitalcredentials/vc` checks a credential's validity dates only
 * after its signature has verified, so a date error in the rejection
 * proves the list is authentic and merely out of date: report it as
 * expired or not yet valid rather than as a bad signature. The match is
 * on vc's message text, carried in the problem's `detail` and shared
 * with the proof suite (see {@link findVcDateProblem}); if the crypto
 * service reports typed expiry problems, those can replace it.
 */
function rejectedListProblems(
  problems: ProblemDetail[],
  url: string
): ProblemDetail[] {
  const dated = findVcDateProblem(problems);
  if (dated !== undefined) {
    return dated.fault === 'expired'
      ? [
          {
            type: ProblemTypes.STATUS_LIST_EXPIRED,
            title: 'Status List Expired',
            detail: `The status list credential ${url} has expired: ${dated.detail}`
          }
        ]
      : [
          {
            type: ProblemTypes.STATUS_LIST_NOT_YET_VALID,
            title: 'Status List Not Yet Valid',
            detail: `The status list credential ${url} is not yet valid: ${dated.detail}`
          }
        ];
  }
  return [
    {
      type: ProblemTypes.STATUS_LIST_SIGNATURE_ERROR,
      title: STATUS_LIST_SIGNATURE_TITLE,
      detail: 'The status list credential signature could not be verified.'
    }
  ];
}

/**
 * Map a non-verified dispatch of a status list credential's proof onto
 * problems: an out-of-date list (see {@link rejectedListProblems}), or
 * `STATUS_LIST_SIGNATURE_ERROR`.
 *
 * `no-service` is a failure, not a skip: `DataIntegrityCryptoService.canVerify`
 * returns false for a document with no proof, so an unsigned status list
 * lands here. Passing that through as success would silently accept lists
 * the previous `vcVerifyCredential` path rejected.
 */
function statusListProofProblems(
  dispatched: Exclude<CryptoDispatchResult, { kind: 'verified' }>,
  url: string
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
      return rejectedListProblems(dispatched.problems, url);
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
 * Classify an error from loading a status list or from `checkStatus`.
 * List validity dates never reach here: they are checked with the list's
 * proof (see {@link rejectedListProblems}).
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

  // Type error. `checkStatus` throws this one directly, without a cause.
  if (
    errorMessage.startsWith(STATUS_TYPE_ERROR) ||
    causeMessage.startsWith(STATUS_TYPE_ERROR)
  ) {
    return [
      {
        type: ProblemTypes.STATUS_LIST_TYPE_ERROR,
        title: 'Status List Type Error',
        detail: STATUS_TYPE_ERROR
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

/** The skip reason when a credential has status entries but none is checked. */
function noCheckedEntryReason(ignored: Array<Record<string, unknown>>): string {
  if (ignored.length === 1) {
    const entry = classifyIgnoredStatusEntry(ignored[0]);
    switch (entry.kind) {
      case 'legacy':
        return `Legacy status type "${entry.statusType}" is not checked.`;
      case 'unknown-type':
        return `Status type "${entry.statusType}" is not BitstringStatusListEntry.`;
      case 'purpose':
        return `BitstringStatusListEntry with statusPurpose "${entry.statusPurpose}" is not checked.`;
    }
  }
  return `No revocation or suspension BitstringStatusListEntry to check; ignored: ${ignoredList(ignored)}.`;
}

function ignoredList(ignored: Array<Record<string, unknown>>): string {
  return ignored.map(describeIgnoredStatusEntry).join(', ');
}

/** One problem for an entry whose bit is set, typed by its purpose. */
function setBitProblem(
  entry: Record<string, unknown> | undefined
): ProblemDetail {
  const url = String(entry?.statusListCredential);
  const index = String(entry?.statusListIndex);
  if (entry?.statusPurpose === 'suspension') {
    return {
      type: ProblemTypes.CREDENTIAL_SUSPENDED,
      title: 'Credential Suspended',
      detail: `The status list ${url} marks the credential suspended (index ${index}).`
    };
  }
  return {
    type: ProblemTypes.CREDENTIAL_REVOKED,
    title: 'Credential Revoked',
    detail: `The status list ${url} marks the credential revoked (index ${index}).`
  };
}

/**
 * Bitstring status list check for revocation/suspension status.
 *
 * This is a **fatal** check: if the verifier cannot conclude that the
 * credential is currently un-revoked and un-suspended (because a status
 * list is missing, has an invalid signature, is expired or not yet
 * valid, has a wrong type, or actually marks the credential as revoked
 * or suspended), the overall verification result is `verified: false`.
 *
 * Every `BitstringStatusListEntry` with `statusPurpose` `revocation` or
 * `suspension` is checked, wherever it sits in `credentialStatus`. Each
 * set bit is its own problem: `CREDENTIAL_REVOKED` or
 * `CREDENTIAL_SUSPENDED`. Other entries — legacy types
 * (`StatusList2021Entry`, `1EdTechRevocationList`), unknown types, and
 * BitstringStatusListEntries for other purposes — are ignored, their
 * lists are not fetched, and the outcome names them.
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
 * suite performs no embedded status check.
 *
 * Skipped (and therefore non-failing) when the credential has no
 * `credentialStatus`, or no entry it checks.
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

    if (credentialStatusEntries(credential).length === 0) {
      return {
        status: 'skipped',
        reason: 'Credential has no credentialStatus.'
      };
    }

    const checked = checkedStatusEntries(credential);
    const ignored = ignoredStatusEntries(credential);
    if (checked.length === 0) {
      return { status: 'skipped', reason: noCheckedEntryReason(ignored) };
    }

    try {
      // The same clock `proof.signature` judges the credential's own
      // validity dates with, so list freshness and credential expiry
      // cannot disagree within one verification.
      const now = new Date(context.timeService?.dateNowMs() ?? Date.now());
      const loaded = new Map<string, unknown>();
      for (const url of checkedStatusListUrls(credential)) {
        const document = await loadStatusList(url, context);
        const dispatched = await dispatchProofVerification({
          services: context.cryptoServices,
          subject: { verifiableCredential: document },
          options: { documentLoader: context.documentLoader, now }
        });
        if (dispatched.kind !== 'verified') {
          return {
            status: 'failure',
            problems: statusListProofProblems(dispatched, url)
          };
        }
        loaded.set(url, document);
      }

      // Only the checked entries go to `checkStatus`, which would otherwise
      // treat a set bit of any purpose as "not verified". Verification is
      // off in this call, so nothing re-reads the copy's signed bytes.
      const statusResult = (await checkStatus({
        credential: { ...credential, credentialStatus: checked },
        documentLoader: preloadedLoader(loaded, context.documentLoader),
        verifyBitstringStatusListCredential: false,
        // Issuer binding is reported by the non-fatal `status.list-issuer`
        // check. The library's own comparison throws, which would make a list
        // signed by a separate status-service DID fatal, and real deployments
        // sign lists that way.
        verifyMatchingIssuers: false
      })) as CheckStatusResult;

      if (statusResult.error !== undefined) {
        return {
          status: 'failure',
          problems: classifyStatusError(statusResult.error)
        };
      }

      if (statusResult.verified === true) {
        const message =
          'Credential status is valid (not revoked or suspended).';
        return {
          status: 'success',
          message:
            ignored.length > 0
              ? `${message} Ignored: ${ignoredList(ignored)}.`
              : message
        };
      }

      const problems = (statusResult.results ?? [])
        .filter(result => result.verified !== true)
        .map(result => setBitProblem(result.credentialStatus));
      return {
        status: 'failure',
        problems:
          problems.length > 0
            ? problems
            : [
                {
                  type: ProblemTypes.STATUS_LIST_ERROR,
                  title: 'Status List Error',
                  detail: 'The status check failed without naming an entry.'
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
