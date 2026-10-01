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

function statusTypeString(type: unknown): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type) && typeof type[0] === 'string') {
    return type[0];
  }
  return undefined;
}

function credentialStatusEntries(
  credential: Record<string, unknown>
): Array<Record<string, unknown>> {
  const credentialStatus = credential.credentialStatus as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | undefined;

  if (!credentialStatus) {
    return [];
  }

  return Array.isArray(credentialStatus)
    ? credentialStatus
    : [credentialStatus];
}

/**
 * Check if the credential has a valid status type that we can check.
 */
function hasBitstringStatusList(credential: Record<string, unknown>): boolean {
  const statuses = credentialStatusEntries(credential);

  if (statuses.length === 0) {
    return false;
  }

  const [firstStatus] = statuses;
  const statusType = statusTypeString(firstStatus?.type);

  return statusType === 'BitstringStatusListEntry';
}

/**
 * Get the status type for skip reason messages.
 */
function getStatusType(
  credential: Record<string, unknown>
): string | undefined {
  const statuses = credentialStatusEntries(credential);
  if (statuses.length === 0) {
    return undefined;
  }

  return statusTypeString(statuses[0]?.type);
}

/**
 * Distinct `statusListCredential` URLs named by the credential, in first-seen
 * order. Entries without a non-empty string URL are ignored so `checkStatus`
 * can reject that input itself.
 */
function statusListCredentialUrls(
  credential: Record<string, unknown>
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const entry of credentialStatusEntries(credential)) {
    const url = entry.statusListCredential;
    if (typeof url !== 'string' || url.length === 0) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/**
 * Load a status list credential through the JSON-LD document loader.
 *
 * Load failures are wrapped with the same message/`cause` shape the
 * third-party `checkStatus` uses, so {@link classifyStatusError} still
 * maps unreachable lists to `STATUS_LIST_NOT_FOUND` (or the generic
 * status error, when the loader's own message is what the tests match).
 */
async function loadStatusListCredential(
  url: string,
  documentLoader: DocumentLoader
): Promise<{ document: unknown }> {
  let result: unknown;
  try {
    result = await documentLoader(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not load "BitstringStatusListCredential"; reason: ${reason}`,
      { cause: error }
    );
  }

  if (result === null || typeof result !== 'object') {
    throw new Error(
      `Could not load "BitstringStatusListCredential"; reason: loader returned no document for ${url}`
    );
  }

  const document = coerceStatusListDocument(
    (result as { document?: unknown }).document,
    url
  );
  return { document };
}

/**
 * Turn a JSON-LD loader's `document` field into a credential object.
 *
 * `JsonLdDocumentLoader` already wraps the protocol-handler return value
 * in `{ document }`. If a handler also returned an envelope, or if the
 * HTTP body was a JSON string (`text/plain`), the credential is nested
 * or unparsed. Unwrap/parse so `cryptoServices` and `checkStatus` see
 * the BitstringStatusListCredential, not the envelope.
 */
function coerceStatusListDocument(raw: unknown, url: string): unknown {
  let document = raw;

  if (
    document !== null &&
    typeof document === 'object' &&
    'document' in document &&
    !('@context' in document) &&
    !('type' in document)
  ) {
    document = (document as { document: unknown }).document;
  }

  if (typeof document === 'string') {
    try {
      document = JSON.parse(document);
    } catch (error) {
      throw new Error(
        `Could not load "BitstringStatusListCredential"; reason: loader returned non-JSON for ${url}`,
        { cause: error }
      );
    }
  }

  if (
    document === undefined ||
    document === null ||
    typeof document !== 'object'
  ) {
    throw new Error(
      `Could not load "BitstringStatusListCredential"; reason: loader returned no document for ${url}`
    );
  }

  return document;
}

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
 * credential proofs use. `@digitalcredentials/vc-bitstring-status-list`
 * keeps ownership of purpose matching, validity dates, bitstring
 * decoding, and index reading.
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
        const { document } = await loadStatusListCredential(
          url,
          context.documentLoader
        );
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
        // Hosted status lists may use a different issuer than the VC (see DataIntegrityCryptoService).
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
