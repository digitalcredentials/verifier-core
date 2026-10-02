/**
 * Status-list helpers shared by the status suite's checks: reading a
 * credential's `credentialStatus` entries, and loading the status list
 * credentials they name.
 */

import type {
  DocumentLoader,
  VerificationContext
} from '../../types/context.js';

export function statusTypeString(type: unknown): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type) && typeof type[0] === 'string') {
    return type[0];
  }
  return undefined;
}

export function credentialStatusEntries(
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
export function hasBitstringStatusList(
  credential: Record<string, unknown>
): boolean {
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
export function getStatusType(
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
export function statusListCredentialUrls(
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
 * The status list URLs `status.bitstring` checks for this credential, or
 * `[]` when it skips.
 */
export function checkedStatusListUrls(
  credential: Record<string, unknown>
): string[] {
  if (!hasBitstringStatusList(credential)) {
    return [];
  }
  return statusListCredentialUrls(credential);
}

/**
 * Load a status list credential through the JSON-LD document loader.
 *
 * Load failures are wrapped with the same message/`cause` shape the
 * third-party `checkStatus` uses, so the status check's error
 * classification still maps unreachable lists to `STATUS_LIST_NOT_FOUND`
 * (or the generic status error, when the loader's own message is what the
 * tests match).
 */
export async function loadStatusListCredential(
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
export function coerceStatusListDocument(raw: unknown, url: string): unknown {
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
 * Status lists loaded during one verification, keyed by the context the
 * verifier builds for that call. `status.bitstring` and
 * `status.list-issuer` both read lists, and the memo makes it one fetch
 * per URL. A failed load is memoised too, so it is not retried within the
 * call. The memo lives as long as the context does.
 */
const loadedLists = new WeakMap<
  VerificationContext,
  Map<string, Promise<unknown>>
>();

/**
 * Load the status list credential at `url` once per `context`.
 */
export function loadStatusList(
  url: string,
  context: VerificationContext
): Promise<unknown> {
  let byUrl = loadedLists.get(context);
  if (!byUrl) {
    byUrl = new Map();
    loadedLists.set(context, byUrl);
  }
  let pending = byUrl.get(url);
  if (!pending) {
    pending = loadStatusListCredential(url, context.documentLoader).then(
      ({ document }) => document
    );
    byUrl.set(url, pending);
  }
  return pending;
}

/**
 * The issuer id the status-list library compares: a string, or the
 * object's `id`.
 */
export function issuerId(issuer: unknown): string | undefined {
  if (typeof issuer === 'string') {
    return issuer.length > 0 ? issuer : undefined;
  }
  if (issuer !== null && typeof issuer === 'object') {
    const id = (issuer as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }
  return undefined;
}
