/**
 * Default {@link CryptoService} for Linked Data Proofs and Data Integrity proofs:
 * credentials via `@digitalcredentials/vc`, a presentation's own proof via
 * `@digitalcredentials/jsonld-signatures`.
 */

import { verifyCredential as vcVerifyCredential } from '@digitalcredentials/vc';
import jsonLdSignatures from '@digitalcredentials/jsonld-signatures';
import type {
  CryptoResult,
  CryptoService,
  CryptoVerifyOptions
} from '../types/crypto-service.js';
import type { CryptoSuite, ProofPurpose } from '../types/crypto-suite.js';
import type { ProblemDetail } from '../types/problem-detail.js';
import type { VerificationSubject } from '../types/subject.js';
import { ProblemTypes } from '../problem-types.js';
import { documentHasProof } from '../util/document-has-proof.js';

/**
 * No-op `checkStatus` passed to `@digitalcredentials/vc` so its
 * `_verifyCredential` doesn't throw `TypeError` when a VC carries
 * `credentialStatus`. The library requires a callable `checkStatus`
 * for any VC with `credentialStatus`; this no-op satisfies that
 * required signature without performing any real status work.
 *
 * Real status verification is owned by `statusSuite`
 * (`src/suites/status/bitstring-status-check.ts`). See plan
 * `docs/plans/2026-04-19-route-via-http-and-dedupe-status-check/`
 * for the rationale (P-E: status is owned solely by the status
 * suite, no double-check from the proof path).
 */
const noopCheckStatus = async (): Promise<{ verified: true; results: [] }> => ({
  verified: true,
  results: []
});

const { purposes } = jsonLdSignatures;

const HTTP_ERROR = 'HTTPError';
const JSONLD_VALIDATION_ERROR = 'jsonld.ValidationError';

function extractErrors(error: unknown): unknown[] {
  const err = error as { errors?: unknown[] } | undefined;
  if (err?.errors && Array.isArray(err.errors)) {
    return err.errors;
  }
  return error ? [error] : [];
}

function isHttpError(errors: unknown[]): boolean {
  return errors.some(e => {
    const x = e as { name?: string; type?: string };
    return x.name === HTTP_ERROR || x.type === HTTP_ERROR;
  });
}

function isJsonLdError(errors: unknown[]): boolean {
  return errors.some(e => {
    const x = e as { name?: string; type?: string };
    return (
      x.name === JSONLD_VALIDATION_ERROR || x.type === JSONLD_VALIDATION_ERROR
    );
  });
}

function getHttpError(errors: unknown[]): unknown | undefined {
  return errors.find(e => {
    const x = e as { name?: string; type?: string };
    return x.name === HTTP_ERROR || x.type === HTTP_ERROR;
  });
}

function isDidWeb(did: string): boolean {
  return did.toLowerCase().startsWith('did:web');
}

function didWebToUrlPattern(did: string): string {
  return did.slice(8).replaceAll(':', '/').toLowerCase();
}

function classifySignatureError(
  error: unknown,
  credential: Record<string, unknown> | undefined
): ProblemDetail[] {
  const errors = extractErrors(error);

  if (isJsonLdError(errors)) {
    return errors.map((e: unknown) => {
      const x = e as { message?: string };
      return {
        type: ProblemTypes.PARSING_ERROR,
        title: 'JSON-LD Validation Error',
        detail: x.message || 'Invalid JSON-LD document'
      };
    });
  }

  if (isHttpError(errors)) {
    const httpError = getHttpError(errors) as
      | {
          requestUrl?: string;
          url?: string;
          message?: string;
        }
      | undefined;
    const requestUrl = httpError?.requestUrl || httpError?.url || '';

    if (credential) {
      const issuer = credential.issuer as string | { id: string } | undefined;
      const issuerDid = typeof issuer === 'string' ? issuer : issuer?.id || '';

      if (isDidWeb(issuerDid)) {
        const didUrlPattern = didWebToUrlPattern(issuerDid);
        if (requestUrl.toLowerCase().includes(didUrlPattern)) {
          return [
            {
              type: ProblemTypes.DID_WEB_UNRESOLVED,
              title: 'DID Web Unresolved',
              detail: `The signature could not be checked because the public signing key could not be retrieved from ${String(requestUrl)}`
            }
          ];
        }
      }
    }

    return [
      {
        type: ProblemTypes.HTTP_ERROR,
        title: 'HTTP Error',
        detail:
          httpError?.message || 'An HTTP error prevented the signature check.'
      }
    ];
  }

  const err = error as { message?: string } | undefined;
  return [
    {
      type: ProblemTypes.INVALID_SIGNATURE,
      title: 'Invalid Signature',
      detail: err?.message || 'The signature is not valid.'
    }
  ];
}

function getPresentationPurpose(
  presentation: Record<string, unknown>,
  challenge: string | null | undefined,
  domain: string | undefined
): ProofPurpose {
  // A supplied challenge is the caller asking for replay protection, so it
  // decides the purpose; the document's own proofPurpose cannot opt out.
  if (typeof challenge === 'string') {
    return new purposes.AuthenticationProofPurpose({ challenge, domain });
  }

  // No challenge supplied: verify the signature only. An authentication
  // proof is checked against its own challenge, since none was expected.
  const proof = Array.isArray(presentation.proof)
    ? (presentation.proof[0] as Record<string, unknown> | undefined)
    : (presentation.proof as Record<string, unknown> | undefined);
  if (proof?.proofPurpose === 'authentication') {
    return new purposes.AuthenticationProofPurpose({
      challenge: typeof proof.challenge === 'string' ? proof.challenge : ''
    });
  }
  return new purposes.AssertionProofPurpose();
}

export interface DataIntegrityCryptoConfig {
  suites: CryptoSuite[];
}

/**
 * Builds a {@link CryptoService} that verifies with the given proof suites
 * (e.g. Ed25519Signature2020 + DataIntegrityProof).
 *
 * Signature verification only — credential status is the responsibility
 * of `statusSuite` (see `src/suites/status/`). This adapter does not
 * read or verify `credentialStatus`.
 */
export function DataIntegrityCryptoService(
  config: DataIntegrityCryptoConfig
): CryptoService {
  const { suites } = config;

  return {
    canVerify: (subject: VerificationSubject): boolean => {
      if (subject.verifiablePresentation) {
        return documentHasProof(
          subject.verifiablePresentation as Record<string, unknown>
        );
      }
      if (subject.verifiableCredential) {
        return documentHasProof(
          subject.verifiableCredential as Record<string, unknown>
        );
      }
      return false;
    },

    verifyCredential: async (
      credential: unknown,
      options: CryptoVerifyOptions
    ): Promise<CryptoResult> => {
      try {
        const result = await vcVerifyCredential({
          credential,
          suite: suites,
          documentLoader: options.documentLoader,
          checkStatus: noopCheckStatus
        });

        const verified = result.verified ?? false;
        if (verified) {
          return {
            verified: true,
            message: 'Signature verified successfully.'
          };
        }

        return {
          verified: false,
          problems: classifySignatureError(
            result.error,
            credential as Record<string, unknown> | undefined
          )
        };
      } catch (e) {
        return {
          verified: false,
          problems: [
            {
              type: ProblemTypes.PROOF_VERIFICATION_ERROR,
              title: 'Verification Error',
              detail:
                e instanceof Error
                  ? e.message
                  : 'An unexpected error occurred during signature verification.'
            }
          ]
        };
      }
    },

    verifyPresentation: async (
      presentation: unknown,
      options: CryptoVerifyOptions
    ): Promise<CryptoResult> => {
      try {
        const purpose = getPresentationPurpose(
          presentation as Record<string, unknown>,
          options.challenge,
          options.domain
        );

        // Only the VP's own proof is verified here; embedded credentials get
        // their own `verifyCredential` run and result.
        const result = (await jsonLdSignatures.verify(presentation, {
          suite: suites,
          purpose,
          documentLoader: options.documentLoader
        })) as { verified: boolean; error?: unknown };

        if (result.verified) {
          return {
            verified: true,
            message: 'Signature verified successfully.'
          };
        }

        return {
          verified: false,
          problems: classifySignatureError(result.error, undefined)
        };
      } catch (e) {
        return {
          verified: false,
          problems: [
            {
              type: ProblemTypes.PROOF_VERIFICATION_ERROR,
              title: 'Verification Error',
              detail:
                e instanceof Error
                  ? e.message
                  : 'An unexpected error occurred during signature verification.'
            }
          ]
        };
      }
    }
  };
}
