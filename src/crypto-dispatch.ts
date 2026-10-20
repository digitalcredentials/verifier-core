/**
 * Shared crypto-service dispatch.
 *
 * Presentation proofs, credential proofs, and status-list-credential
 * proofs all resolve through this helper against the same
 * `CryptoService[]`. Callers own their problem types:
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
import { ProblemTypes } from './problem-types.js';
import { proofLabel } from './util/proof-label.js';
import { isValidityDateOnly } from './util/validity-date-problems.js';

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

  try {
    // Service selection sits inside the `try` so a throwing `canVerify`
    // is reported as `threw` rather than rejecting the caller.
    const service = services.find(s => s.canVerify(subject));
    if (!service) {
      return { kind: 'no-service' };
    }

    const presentation = subject.verifiablePresentation;
    const credential = subject.verifiableCredential;

    if (!presentation && !credential) {
      return { kind: 'no-service' };
    }

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

/** One proof's verdict within a proof set. */
export interface ProofOutcome {
  /** 1-based position in the document's `proof` array. */
  position: number;
  /** Total proofs in the set. */
  total: number;
  /** `type`, plus `cryptosuite` when present: "DataIntegrityProof, eddsa-rdfc-2022". */
  label: string;
  result: CryptoDispatchResult;
}

export interface ProofSetDispatchResult {
  /** The verdict for the whole document, in the shape callers already handle. */
  combined: CryptoDispatchResult;
  /** Each proof's verdict; empty unless the document carries two or more proofs. */
  proofs: ProofOutcome[];
}

/**
 * Whether a proof was not checked at all: rejected only because no
 * registered suite supports it, or it was made for another purpose.
 */
export function isUnsupportedProof(result: CryptoDispatchResult): boolean {
  return (
    result.kind === 'rejected' &&
    result.problems.length > 0 &&
    result.problems.every(p => p.type === ProblemTypes.PROOF_UNSUPPORTED)
  );
}

/**
 * A rejected proof's problems, each `detail` saying which proof of the
 * set it is about: "Proof 2 of 2 (DataIntegrityProof, eddsa-rdfc-2022): …".
 */
export function problemsOfProof(outcome: ProofOutcome): ProblemDetail[] {
  if (outcome.result.kind !== 'rejected') {
    return [];
  }
  const prefix = `Proof ${outcome.position} of ${outcome.total} (${outcome.label}): `;
  return outcome.result.problems.map(problem => ({
    ...problem,
    detail: prefix + problem.detail
  }));
}

/**
 * Verify a document's proofs one at a time, so that every proof a
 * registered suite can check must verify.
 *
 * jsonld-signatures' `ProofSet.verify` reports a proof set verified when
 * *any* of its proofs verified, and silently skips proofs no suite or
 * purpose matches. vc then checks validity dates after that "any"
 * verdict and, when the date check fails, drops the per-proof results.
 * VC Data Integrity §4.5 requires every proof to verify instead. Handing
 * each {@link CryptoService} call a shallow copy carrying a single proof
 * makes each verdict about exactly one proof, which also keeps the
 * `CryptoResult` contract (a date-only rejection means the proof
 * verified) true for proof sets. Proof chains (`previousProof`) are not
 * supported by the underlying libraries either way.
 *
 * A document with zero or one proof is dispatched exactly as
 * {@link dispatchProofVerification} would. For a proof set, `combined`
 * is, in order: the first proof that threw; `no-service` if any proof
 * found no service; every failing proof's problems, prefixed with the
 * proof's position and label; the first date-only rejection, unprefixed
 * because the dates belong to the document; the first verified proof;
 * otherwise, when no proof was checked at all, the unsupported proofs'
 * problems, prefixed. Unsupported proofs beside checked ones do not change `combined`;
 * they are left in `proofs` for the caller to report.
 */
export async function dispatchProofSetVerification(
  input: CryptoDispatchInput
): Promise<ProofSetDispatchResult> {
  const { subject } = input;
  // The same document dispatchProofVerification picks.
  const key: keyof VerificationSubject = subject.verifiablePresentation
    ? 'verifiablePresentation'
    : 'verifiableCredential';
  const document = subject[key] as Record<string, unknown> | undefined;
  const proofSet = document?.proof;

  if (!document || !Array.isArray(proofSet) || proofSet.length < 2) {
    return { combined: await dispatchProofVerification(input), proofs: [] };
  }

  const total = proofSet.length;
  // Copies, never edits: the signed bytes of the original document must
  // stay as they arrived.
  const proofs = await Promise.all(
    proofSet.map(
      async (proof: unknown, index): Promise<ProofOutcome> => ({
        position: index + 1,
        total,
        label: proofLabel(proof),
        result: await dispatchProofVerification({
          ...input,
          subject: { ...subject, [key]: { ...document, proof } }
        })
      })
    )
  );

  return { combined: combineProofOutcomes(proofs), proofs };
}

function combineProofOutcomes(proofs: ProofOutcome[]): CryptoDispatchResult {
  const threw = proofs.find(p => p.result.kind === 'threw');
  if (threw) {
    return threw.result;
  }
  if (proofs.some(p => p.result.kind === 'no-service')) {
    return { kind: 'no-service' };
  }

  const unsupported: ProofOutcome[] = [];
  const dateOnly: ProofOutcome[] = [];
  const failing: ProofOutcome[] = [];
  for (const outcome of proofs) {
    const { result } = outcome;
    if (result.kind !== 'rejected') {
      continue;
    }
    if (isUnsupportedProof(result)) {
      unsupported.push(outcome);
    } else if (isValidityDateOnly(result.problems)) {
      dateOnly.push(outcome);
    } else {
      failing.push(outcome);
    }
  }

  if (failing.length > 0) {
    return { kind: 'rejected', problems: failing.flatMap(problemsOfProof) };
  }

  if (dateOnly.length > 0) {
    return dateOnly[0].result;
  }
  const verified = proofs.find(p => p.result.kind === 'verified');
  if (verified) {
    return verified.result;
  }
  // Nothing was checked at all, so there is no verified proof to warn
  // beside: as fatal as a single unsupported proof.
  return { kind: 'rejected', problems: unsupported.flatMap(problemsOfProof) };
}
