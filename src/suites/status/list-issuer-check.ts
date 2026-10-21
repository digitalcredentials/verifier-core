import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import { isValidityDateOnly } from '../../util/validity-date-problems.js';
import {
  checkedStatusListUrls,
  issuerId,
  loadStatusList,
  verifyStatusList
} from './status-lists.js';

/**
 * The status list at `url`, if it loads and its proof verifies (or is
 * rejected only for its validity dates); otherwise undefined.
 */
async function establishedList(
  url: string,
  context: VerificationContext,
  now: Date
): Promise<unknown> {
  let list: unknown;
  try {
    list = await loadStatusList(url, context);
  } catch {
    return undefined;
  }
  const dispatched = await verifyStatusList(url, list, context, now);
  if (dispatched.kind === 'verified') {
    return list;
  }
  if (
    dispatched.kind === 'rejected' &&
    isValidityDateOnly(dispatched.problems)
  ) {
    return list;
  }
  return undefined;
}

/**
 * Reports a status list that is not issued by the credential's issuer.
 *
 * Without this, a validly signed list from any DID decides revocation, so
 * whoever controls the list host can un-revoke a credential unseen. The
 * check compares the list's **claimed** `issuer` id with the credential's,
 * by exact string — a string issuer, or an issuer object's `id` — the same
 * rule `@digitalcredentials/vc-bitstring-status-list` uses.
 *
 * It compares only lists whose proof it can establish, since a verified
 * proof is what binds the list's signing key to its claimed `issuer`. It
 * reuses the lists `status.bitstring` loaded and the proof verifications
 * it made, and makes any it did not: `status.bitstring` does not halt,
 * and may have failed, and stopped, before reaching every list. A list
 * rejected only
 * for its validity dates counts as established, since the dates are
 * checked only once the proof verified. So a list that marks the
 * credential revoked is still checked for who signed it.
 *
 * This is a **warning** (`fatal: false`): `verified` is unchanged. Some
 * status services sign every list with one DID of their own rather than
 * the issuing tenant's, so a mismatch is normal in those deployments. A
 * consumer that needs the binding enforced should treat
 * `STATUS_LIST_ISSUER_MISMATCH` as decisive.
 */
export const statusListIssuerCheck: VerificationCheck = {
  id: 'status.list-issuer',
  name: 'Status List Issuer Check',
  description:
    "Reports when a status list is not issued by the credential's issuer.",
  fatal: false,
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

    const urls = checkedStatusListUrls(credential);
    if (urls.length === 0) {
      return {
        status: 'skipped',
        reason: 'No status list was checked.'
      };
    }

    const credentialIssuer = issuerId(credential.issuer);
    // The same clock `status.bitstring` judges list freshness with.
    const now = new Date(context.timeService?.dateNowMs() ?? Date.now());
    const problems: ProblemDetail[] = [];
    let unestablished = false;
    for (const url of urls) {
      const list = await establishedList(url, context, now);
      if (list === undefined) {
        unestablished = true;
        continue;
      }

      const listIssuer = issuerId(
        (list as { issuer?: unknown } | null)?.issuer
      );
      if (
        credentialIssuer === undefined ||
        listIssuer === undefined ||
        listIssuer !== credentialIssuer
      ) {
        problems.push({
          type: ProblemTypes.STATUS_LIST_ISSUER_MISMATCH,
          title: 'Status List Issuer Mismatch',
          detail: `The status list ${url} is issued by ${listIssuer ?? '(no issuer)'}, not by the credential's issuer ${credentialIssuer ?? '(no issuer)'}.`
        });
      }
    }

    if (problems.length > 0) {
      return { status: 'failure', problems };
    }

    if (unestablished) {
      return {
        status: 'skipped',
        reason:
          'A status list could not be loaded or its proof did not verify; status.bitstring reports why.'
      };
    }

    return {
      status: 'success',
      message: "Every status list is issued by the credential's issuer."
    };
  }
};
