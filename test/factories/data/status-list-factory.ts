import {
  createCredential,
  createList
} from '@digitalcredentials/vc-bitstring-status-list';
import {
  DEFAULT_TEST_ISSUER_DID,
  PlaceholderProof
} from './credential-factory.js';
import { deepMerge } from './merge-deep.js';

function isoTimestampMs(): string {
  return new Date().toISOString();
}

export type StatusListCredentialFactoryOptions = {
  id?: string;
  issuer?: string;
  validFrom?: string;
  revokedIndexes?: number[];
  listLength?: number;
  statusPurpose?: string;
  proof?: unknown;
} & Record<string, unknown>;

/**
 * Bitstring status list credential; uses library encoding for revoked bits.
 */
export async function StatusListCredentialFactory(
  options: StatusListCredentialFactoryOptions = {}
): Promise<Record<string, unknown>> {
  const {
    id = 'https://example.test/status/list1',
    issuer = DEFAULT_TEST_ISSUER_DID,
    validFrom = isoTimestampMs(),
    revokedIndexes = [],
    listLength = 128,
    statusPurpose = 'revocation',
    proof = PlaceholderProof(),
    ...rest
  } = options;

  const list = await createList({ length: listLength });
  for (const index of revokedIndexes) {
    list.setStatus(index, true);
  }

  const cred = (await createCredential({
    id,
    list,
    statusPurpose
  })) as Record<string, unknown>;

  return deepMerge(
    deepMerge(cred, {
      issuer,
      validFrom,
      proof
    }),
    rest
  );
}

export type BitstringStatusEntryOptions = {
  statusListCredential?: string;
  statusListIndex?: string;
  statusPurpose?: string;
  id?: string;
} & Record<string, unknown>;

/**
 * `credentialStatus` entry pointing at a status list credential URL.
 */
export function BitstringStatusEntry(
  options: BitstringStatusEntryOptions = {}
): Record<string, unknown> {
  const {
    statusListCredential = 'https://example.test/status/list1',
    statusListIndex = '0',
    statusPurpose = 'revocation',
    id,
    ...rest
  } = options;

  return {
    id: id ?? `${statusListCredential}#${statusListIndex}`,
    type: 'BitstringStatusListEntry',
    statusPurpose,
    statusListCredential,
    statusListIndex,
    ...rest
  };
}
