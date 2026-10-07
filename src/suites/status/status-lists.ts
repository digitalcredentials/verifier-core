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

// Legacy status types, never checked.
const LEGACY_STATUS_TYPES: readonly string[] = [
  'StatusList2021Entry',
  '1EdTechRevocationList'
];

// The purposes whose set bit means the credential is not currently valid.
const CHECKED_STATUS_PURPOSES: readonly string[] = ['revocation', 'suspension'];

/**
 * Whether `status.bitstring` checks this `credentialStatus` entry: a
 * `BitstringStatusListEntry` (compared exactly, as the status-list library
 * does) for revocation or suspension. Every other entry is ignored.
 */
export function isCheckedStatusEntry(entry: unknown): boolean {
  if (entry === null || typeof entry !== 'object') {
    return false;
  }
  const { type, statusPurpose } = entry as Record<string, unknown>;
  return (
    type === 'BitstringStatusListEntry' &&
    typeof statusPurpose === 'string' &&
    CHECKED_STATUS_PURPOSES.includes(statusPurpose)
  );
}

export function checkedStatusEntries(
  credential: Record<string, unknown>
): Array<Record<string, unknown>> {
  return credentialStatusEntries(credential).filter(isCheckedStatusEntry);
}

export function ignoredStatusEntries(
  credential: Record<string, unknown>
): Array<Record<string, unknown>> {
  return credentialStatusEntries(credential).filter(
    entry => !isCheckedStatusEntry(entry)
  );
}

export type IgnoredStatusEntry =
  | { kind: 'legacy'; statusType: string }
  | { kind: 'unknown-type'; statusType: string }
  | { kind: 'purpose'; statusPurpose: string };

/**
 * Why `status.bitstring` ignores an entry: a legacy status type, another
 * status type, or a BitstringStatusListEntry for a purpose it does not
 * check. `statusType` / `statusPurpose` are `String(...)` of the value.
 */
export function classifyIgnoredStatusEntry(entry: unknown): IgnoredStatusEntry {
  const record =
    entry !== null && typeof entry === 'object'
      ? (entry as Record<string, unknown>)
      : {};
  if (record.type === 'BitstringStatusListEntry') {
    return { kind: 'purpose', statusPurpose: String(record.statusPurpose) };
  }
  const statusType = String(statusTypeString(record.type));
  return LEGACY_STATUS_TYPES.includes(statusType)
    ? { kind: 'legacy', statusType }
    : { kind: 'unknown-type', statusType };
}

/** Name an ignored entry in a message. */
export function describeIgnoredStatusEntry(entry: unknown): string {
  const ignored = classifyIgnoredStatusEntry(entry);
  switch (ignored.kind) {
    case 'legacy':
      return `legacy status type "${ignored.statusType}"`;
    case 'unknown-type':
      return `status type "${ignored.statusType}"`;
    case 'purpose':
      return `BitstringStatusListEntry with statusPurpose "${ignored.statusPurpose}"`;
  }
}

/**
 * Distinct `statusListCredential` URLs of the entries `status.bitstring`
 * checks, in first-seen order; `[]` when it skips. A checked entry without
 * a non-empty string URL contributes none, so `checkStatus` can reject that
 * entry itself.
 */
export function checkedStatusListUrls(
  credential: Record<string, unknown>
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const entry of checkedStatusEntries(credential)) {
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
 * third-party `checkStatus` uses, so the status check's error
 * classification still maps unreachable lists to `STATUS_LIST_NOT_FOUND`
 * (or the generic status error, when the loader's own message is what the
 * tests match).
 *
 * The loader owns unwrapping its `{ document }` envelope and parsing the
 * response body; this only rejects a result that carries no document
 * object.
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

  const document =
    result !== null && typeof result === 'object'
      ? (result as { document?: unknown }).document
      : undefined;
  if (document === null || typeof document !== 'object') {
    throw new Error(
      `Could not load "BitstringStatusListCredential"; reason: loader returned no document for ${url}`
    );
  }

  return { document };
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
