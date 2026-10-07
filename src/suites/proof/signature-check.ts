import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import { dispatchProofVerification } from '../../crypto-dispatch.js';
import { documentHasProof } from '../../util/document-has-proof.js';
import { findVcDateProblem } from '../../util/vc-date-messages.js';

const NO_APPLICABLE_SERVICE: ProblemDetail = {
  type: ProblemTypes.PROOF_VERIFICATION_ERROR,
  title: 'No Applicable Crypto Service',
  detail:
    'No registered crypto service can verify this subject (check canVerify / cryptoServices).'
};

const PRESENTATION_NOT_SIGNED: ProblemDetail = {
  type: ProblemTypes.PROOF_VERIFICATION_ERROR,
  title: 'Presentation Not Signed',
  detail:
    'The presentation has no proof. Pass unsignedPresentation: true to accept an unsigned presentation.'
};

const CHALLENGE_REQUIRED: ProblemDetail = {
  type: ProblemTypes.PROOF_VERIFICATION_ERROR,
  title: 'Challenge Required',
  detail:
    'A domain was supplied without a challenge. The domain can only be checked alongside a challenge.'
};

const UNSIGNED_PRESENTATION_ACCEPTED =
  'Presentation is unsigned; accepted because unsignedPresentation is set.';

/**
 * Classify a crypto service's rejection.
 *
 * `@digitalcredentials/vc` checks validity dates only after the
 * signature has verified, so a date error in the rejection proves the
 * document is authentic and merely out of date. Saying "Invalid
 * Signature" there accuses an honest issuer of forgery, so an expired
 * or not-yet-valid credential gets its own problem type. Matching is on
 * vc's message text, carried in the problem's `detail` — the same
 * patterns `status.bitstring` uses for a status list credential.
 *
 * Still fatal either way: the credential is not currently usable.
 */
function rejectedProblems(problems: ProblemDetail[]): ProblemDetail[] {
  const dated = findVcDateProblem(problems);
  if (dated === undefined) {
    return problems;
  }
  return dated.fault === 'expired'
    ? [
        {
          type: ProblemTypes.CREDENTIAL_EXPIRED,
          title: 'Credential Expired',
          detail: dated.detail
        }
      ]
    : [
        {
          type: ProblemTypes.CREDENTIAL_NOT_YET_VALID,
          title: 'Credential Not Yet Valid',
          detail: dated.detail
        }
      ];
}

/**
 * Signature verification check — dispatches to {@link VerificationContext.cryptoServices}.
 *
 * A presentation must carry a proof unless
 * {@link VerificationContext.unsignedPresentation} is set, in which case a
 * proof-less presentation is skipped rather than verified. A proof that is
 * present is always verified, whatever the flag says.
 *
 * A supplied {@link VerificationContext.challenge} (and
 * {@link VerificationContext.domain}) is always enforced on a presentation's
 * proof. A domain without a challenge fails before dispatch.
 *
 * This check also owns the credential's validity dates, because the
 * library that verifies the proof is the one that reads them — and it
 * reads them only once the signature has verified. The clock comes from
 * {@link VerificationContext.timeService}, so a verifier built on a
 * `FakeTimeService` judges expiry at the pinned time. An expired or
 * not-yet-valid credential fails with `CREDENTIAL_EXPIRED` /
 * `CREDENTIAL_NOT_YET_VALID` rather than `INVALID_SIGNATURE`; it is
 * authentic, and still fatal.
 */
export const signatureCheck: VerificationCheck = {
  id: 'proof.signature',
  name: 'Signature Verification',
  description:
    'Verifies the cryptographic signature of the credential or presentation. A presentation must be signed unless unsignedPresentation is set.',
  fatal: true,
  appliesTo: ['verifiableCredential', 'verifiablePresentation'],
  execute: async (
    subject: VerificationSubject,
    context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;
    const presentation = subject.verifiablePresentation as
      | Record<string, unknown>
      | undefined;

    if (!credential && !presentation) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PROOF_VERIFICATION_ERROR,
            title: 'No Verifiable Content',
            detail: 'No verifiable credential or presentation found in subject.'
          }
        ]
      };
    }

    if (presentation && !documentHasProof(presentation)) {
      return context.unsignedPresentation
        ? { status: 'skipped', reason: UNSIGNED_PRESENTATION_ACCEPTED }
        : { status: 'failure', problems: [PRESENTATION_NOT_SIGNED] };
    }

    if (
      presentation &&
      context.domain !== undefined &&
      typeof context.challenge !== 'string'
    ) {
      return { status: 'failure', problems: [CHALLENGE_REQUIRED] };
    }

    const dispatched = await dispatchProofVerification({
      services: context.cryptoServices,
      subject,
      options: {
        documentLoader: context.documentLoader,
        challenge: context.challenge,
        domain: context.domain,
        // A context built directly in a test may carry no clock; the
        // production factory always sets one.
        now: new Date(context.timeService?.dateNowMs() ?? Date.now())
      }
    });

    switch (dispatched.kind) {
      case 'verified':
        return {
          status: 'success',
          message: dispatched.message ?? 'Signature verified successfully.'
        };
      case 'rejected':
        return {
          status: 'failure',
          problems: rejectedProblems(dispatched.problems)
        };
      case 'no-service':
        return { status: 'failure', problems: [NO_APPLICABLE_SERVICE] };
      case 'threw':
        return {
          status: 'failure',
          problems: [
            {
              type: ProblemTypes.PROOF_VERIFICATION_ERROR,
              title: 'Verification Error',
              detail:
                dispatched.error instanceof Error
                  ? dispatched.error.message
                  : 'An unexpected error occurred during signature verification.'
            }
          ]
        };
    }
  }
};
