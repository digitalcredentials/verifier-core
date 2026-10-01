import type {
  CryptoResult,
  CryptoService,
  CryptoVerifyOptions
} from '../../../src/types/crypto-service.js';
import type { ProblemDetail } from '../../../src/types/problem-detail.js';
import type { VerificationSubject } from '../../../src/types/subject.js';

const DEFAULT_FAIL_PROBLEMS: ProblemDetail[] = [
  {
    type: 'https://www.w3.org/TR/vc-data-model#PROOF_VERIFICATION_ERROR',
    title: 'Fake Verification Failed',
    detail: 'FakeCryptoService was configured with verified: false.'
  }
];

function proofIsDataIntegrity(proof: unknown): boolean {
  if (proof === null || proof === undefined || typeof proof !== 'object') {
    return false;
  }
  const p = proof as Record<string, unknown>;
  if (p.type === 'DataIntegrityProof') {
    return true;
  }
  return typeof p.cryptosuite === 'string';
}

/**
 * True when the subject's credential or presentation carries a Data Integrity-style proof
 * (`DataIntegrityProof` type or `cryptosuite` field).
 */
export function hasDataIntegrityProof(subject: VerificationSubject): boolean {
  const doc = subject.verifiablePresentation ?? subject.verifiableCredential;
  if (doc === undefined || doc === null || typeof doc !== 'object') {
    return false;
  }
  const proof = (doc as Record<string, unknown>).proof;
  if (Array.isArray(proof)) {
    return proof.some(proofIsDataIntegrity);
  }
  return proofIsDataIntegrity(proof);
}

export type FakeCryptoServiceOptions = {
  canVerify?: (subject: VerificationSubject) => boolean;
  verified?: boolean;
  message?: string;
  problems?: ProblemDetail[];
  /** When set, verifyCredential / verifyPresentation reject with this error. */
  throwInVerify?: Error;
};

/**
 * {@link CryptoService} stub for tests — no real cryptography.
 */
export function FakeCryptoService(
  options: FakeCryptoServiceOptions = {}
): CryptoService {
  const {
    canVerify = () => true,
    verified = true,
    message = 'Fake verification passed.',
    problems = DEFAULT_FAIL_PROBLEMS,
    throwInVerify
  } = options;

  const resolve = async (): Promise<CryptoResult> => {
    if (throwInVerify !== undefined) {
      throw throwInVerify;
    }
    if (verified) {
      return { verified: true, message };
    }
    return { verified: false, problems };
  };

  return {
    canVerify,
    verifyCredential: async (
      _credential: unknown,
      _opts: CryptoVerifyOptions
    ) => resolve(),
    verifyPresentation: async (
      _presentation: unknown,
      _opts: CryptoVerifyOptions
    ) => resolve()
  };
}
