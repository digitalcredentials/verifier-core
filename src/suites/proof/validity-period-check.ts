import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import {
  firstContextEntry,
  VC_CONTEXT_V1,
  VC_CONTEXT_V2
} from '../core/structure-helpers.js';

/** The credential's start and end dates, by the names its version uses. */
interface ValidityProperties {
  start: 'issuanceDate' | 'validFrom';
  end: 'expirationDate' | 'validUntil';
}

function validityProperties(
  credential: Record<string, unknown>
): ValidityProperties | undefined {
  const firstContext = firstContextEntry(credential['@context']);
  if (firstContext === VC_CONTEXT_V1) {
    return { start: 'issuanceDate', end: 'expirationDate' };
  }
  if (firstContext === VC_CONTEXT_V2) {
    return { start: 'validFrom', end: 'validUntil' };
  }
  return undefined;
}

/** The date `value` names, or undefined when it names none. */
function dateOf(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Validity period check: the credential's own dates against the
 * verifier's clock.
 *
 * The version comes from the first `@context` entry, as in
 * `@digitalcredentials/vc` and `core.vc-structure`: v1 reads
 * `issuanceDate` / `expirationDate`, v2 `validFrom` / `validUntil`. The
 * comparisons are vc's — expired once the clock is past the end, not yet
 * valid while it is before the start — but every fault is reported, not
 * only the first. A date that does not parse is left to
 * `core.vc-structure`, which has already failed the credential for it.
 *
 * It runs after `proof.signature`, so by the time it runs the credential
 * is authentic. Being out of date makes it unusable, so the check is
 * fatal (`verified: false`); but whether it was also revoked, and whether
 * its issuer is registered, still matter to a verifier, so it does not
 * halt the checks after it.
 */
export const validityPeriodCheck: VerificationCheck = {
  id: 'proof.validity-period',
  name: 'Validity Period',
  description:
    "Checks the credential's validity dates against the verifier's clock.",
  fatal: true,
  halts: false,
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

    const properties = validityProperties(credential);
    const startValue = properties ? credential[properties.start] : undefined;
    const endValue = properties ? credential[properties.end] : undefined;
    const start = dateOf(startValue);
    const end = dateOf(endValue);
    if (!properties || (start === undefined && end === undefined)) {
      return { status: 'success', message: 'No validity period stated.' };
    }

    // Read separately from `proof.signature`'s clock, a few milliseconds
    // later; that can only matter at the exact boundary. A context built
    // directly in a test may carry no clock; the production factory
    // always sets one.
    const now = new Date(context.timeService?.dateNowMs() ?? Date.now());
    const problems: ProblemDetail[] = [];
    if (end !== undefined && now > end) {
      problems.push({
        type: ProblemTypes.CREDENTIAL_EXPIRED,
        title: 'Credential Expired',
        detail: `The current date time (${now.toISOString()}) is after "${properties.end}" (${String(endValue)}).`
      });
    }
    if (start !== undefined && now < start) {
      problems.push({
        type: ProblemTypes.CREDENTIAL_NOT_YET_VALID,
        title: 'Credential Not Yet Valid',
        detail: `The current date time (${now.toISOString()}) is before "${properties.start}" (${String(startValue)}).`
      });
    }

    if (problems.length > 0) {
      return { status: 'failure', problems };
    }
    return {
      status: 'success',
      message: 'The credential is within its validity period.'
    };
  }
};
