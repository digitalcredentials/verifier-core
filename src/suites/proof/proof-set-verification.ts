import {
  dispatchProofSetVerification,
  type ProofSetDispatchResult
} from '../../crypto-dispatch.js';
import type { VerificationContext } from '../../types/context.js';
import type { VerificationSubject } from '../../types/subject.js';

/**
 * Proof verifications during one verification, keyed by the context the
 * verifier builds for that call and then by the document verified.
 * `proof.signature` and `proof.unsupported-proofs` both need each
 * proof's verdict, and the memo makes it one verification per document,
 * judged at the first caller's `now`.
 */
const verifiedProofs = new WeakMap<
  VerificationContext,
  WeakMap<object, Promise<ProofSetDispatchResult>>
>();

/**
 * Verify the proofs of the subject's document — its presentation if it
 * has one, otherwise its credential — once per `context`, one proof at a
 * time when the document carries a proof set.
 */
export function verifyProofSet(
  subject: VerificationSubject,
  context: VerificationContext
): Promise<ProofSetDispatchResult> {
  const document =
    subject.verifiablePresentation ?? subject.verifiableCredential;
  if (document === null || typeof document !== 'object') {
    return dispatch(subject, context);
  }

  let byDocument = verifiedProofs.get(context);
  if (!byDocument) {
    byDocument = new WeakMap();
    verifiedProofs.set(context, byDocument);
  }
  let pending = byDocument.get(document);
  if (!pending) {
    pending = dispatch(subject, context);
    byDocument.set(document, pending);
  }
  return pending;
}

function dispatch(
  subject: VerificationSubject,
  context: VerificationContext
): Promise<ProofSetDispatchResult> {
  return dispatchProofSetVerification({
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
}
