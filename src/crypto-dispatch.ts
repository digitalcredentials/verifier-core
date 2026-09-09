/**
 * Shared crypto-service dispatch.
 *
 * Presentation proofs, credential proofs, and (after the status-check
 * rewrite) status-list-credential proofs all resolve through this helper
 * against the same `CryptoService[]`. Callers own their problem types:
 * the helper reports a neutral outcome so a bad signature on a credential
 * and a bad signature on its status list credential stay distinct
 * diagnostics.
 *
 * This is orchestration over injected adapters, not an adapter itself —
 * it lives at the `src/` root alongside `run-suites.ts` and
 * `fold-results.ts`, not under `src/services/`.
 */

import type {
  CryptoService,
  CryptoVerifyOptions
} from './types/crypto-service.js';
import type { ProblemDetail } from './types/problem-detail.js';
import type { VerificationSubject } from './types/subject.js';

/**
 * Outcome of dispatching a proof to the registered {@link CryptoService}s.
 *
 * Deliberately *not* a `ProblemDetail`-bearing type: the two callers
 * (`signature-check` and `bitstring-status-check`) describe the same
 * underlying failures with different problem types, because a bad signature
 * on the credential and a bad signature on its status list credential are
 * different things to the consumer reading the result. Sharing the dispatch
 * must not homogenize the diagnostics.
 */
export type CryptoDispatchResult =
  | { kind: 'verified'; message?: string }
  | { kind: 'rejected'; problems: ProblemDetail[] }
  | { kind: 'no-service' }
  | { kind: 'threw'; error: unknown };

export interface CryptoDispatchInput {
  services: CryptoService[] | undefined;
  subject: VerificationSubject;
  options: CryptoVerifyOptions;
}

/**
 * Select the first {@link CryptoService} that can verify `subject` and invoke
 * it. Presentations route to `verifyPresentation`, credentials to
 * `verifyCredential`; a subject carrying both prefers the presentation, which
 * matches the pre-extraction behavior of `signature-check`.
 */
export async function dispatchProofVerification(
  input: CryptoDispatchInput
): Promise<CryptoDispatchResult> {
  const { services, subject, options } = input;

  if (!services || services.length === 0) {
    return { kind: 'no-service' };
  }

  const service = services.find(s => s.canVerify(subject));
  if (!service) {
    return { kind: 'no-service' };
  }

  const presentation = subject.verifiablePresentation;
  const credential = subject.verifiableCredential;

  if (!presentation && !credential) {
    return { kind: 'no-service' };
  }

  try {
    const cryptoResult = presentation
      ? await service.verifyPresentation(presentation, options)
      : await service.verifyCredential(credential, options);

    if (cryptoResult.verified) {
      return { kind: 'verified', message: cryptoResult.message };
    }

    return { kind: 'rejected', problems: cryptoResult.problems };
  } catch (error) {
    return { kind: 'threw', error };
  }
}
