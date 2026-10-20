import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import { dispatchProofVerification } from '../../crypto-dispatch.js';
import { documentHasProof } from '../../util/document-has-proof.js';
import { isValidityDateOnly } from '../../util/validity-date-problems.js';

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
 * The credential's validity dates belong to `proof.validity-period`,
 * which runs next. A crypto service may still reject for them:
 * `@digitalcredentials/vc` judges the dates itself, and only once the
 * proof has verified. A rejection made only of validity-date problems
 * therefore proves the signature good, and reads as success here, so an
 * out-of-date credential is not reported as forged and does not halt the
 * checks after it. The clock passed to the crypto service comes from
 * {@link VerificationContext.timeService}.
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
        if (isValidityDateOnly(dispatched.problems)) {
          return {
            status: 'success',
            message: 'Signature verified successfully.'
          };
        }
        return { status: 'failure', problems: dispatched.problems };
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
