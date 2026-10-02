import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import {
  checkedStatusListUrls,
  issuerId,
  loadStatusList
} from './status-lists.js';

/**
 * Reports a status list that is not issued by the credential's issuer.
 *
 * Without this, a validly signed list from any DID decides revocation, so
 * whoever controls the list host can un-revoke a credential unseen. The
 * check compares the list's **claimed** `issuer` id with the credential's,
 * by exact string — a string issuer, or an issuer object's `id` — the same
 * rule `@digitalcredentials/vc-bitstring-status-list` uses.
 *
 * It runs after `status.bitstring` and reads the lists that check
 * already loaded. That check verifies each list's proof, which binds the
 * list's signing key to its claimed `issuer`; so by the time this check
 * runs, the claim is the proven signer. When `status.bitstring` fails it
 * is fatal, and this check is reported as not run.
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
    const problems: ProblemDetail[] = [];
    for (const url of urls) {
      let list: unknown;
      try {
        list = await loadStatusList(url, context);
      } catch {
        return {
          status: 'skipped',
          reason:
            'Status list could not be loaded; status.bitstring reports why.'
        };
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

    return {
      status: 'success',
      message: "Every status list is issued by the credential's issuer."
    };
  }
};
