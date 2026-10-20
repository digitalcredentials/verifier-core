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
import { isJsigsNoMatch } from '../util/jsigs-no-match.js';
import { proofLabel } from '../util/proof-label.js';
import { isVerificationMethodMessage } from '../util/verification-method-messages.js';
import { vcDateFault } from '../util/vc-date-messages.js';

/**
 * No-op `checkStatus` passed to `@digitalcredentials/vc` so its
 * `_verifyCredential` doesn't throw `TypeError` when a VC carries
 * `credentialStatus`. The library requires a callable `checkStatus`
 * for any VC with `credentialStatus`; this no-op satisfies that
 * required signature without performing any real status work.
 *
 * Real status verification is owned solely by `statusSuite`
 * (`src/suites/status/bitstring-status-check.ts`), so the proof
 * path must not check status a second time: a double check would
 * fetch the status list twice and could report two different
 * answers for one credential.
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

/**
 * The messages the libraries actually wrote, in order.
 *
 * A failed verification arrives as a `VerificationError` whose own
 * message is "Verification error(s)." — true of a tampered credential and
 * of a misconfigured key alike, and so of no use to anyone reading the
 * result. The real messages are the wrapped ones.
 */
function messagesOf(errors: unknown[]): string[] {
  return errors
    .map(e => (e as { message?: string } | undefined)?.message)
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}

function isDidWeb(did: string): boolean {
  return did.toLowerCase().startsWith('did:web');
}

function didWebToUrlPattern(did: string): string {
  return did.slice(8).replaceAll(':', '/').toLowerCase();
}

/**
 * Turn a signature library's rejection into problems a consumer can act on.
 *
 * Exported for the unit tests that pin the library message patterns; it is
 * not part of the package's public surface (see `src/index.ts`).
 */
export function classifySignatureError(
  error: unknown,
  credential: Record<string, unknown> | undefined
): ProblemDetail[] {
  // vc checks validity dates only after the proof verified, and reports a
  // date failure as a plain Error rather than a VerificationError. Say so
  // with a typed problem: it is how `proof.signature` knows the proof
  // verified, and how `status.bitstring` tells an expired list from a bad one.
  const dateFault = vcDateFault(error);
  if (dateFault !== undefined) {
    return [
      dateFault === 'expired'
        ? {
            type: ProblemTypes.CREDENTIAL_EXPIRED,
            title: 'Credential Expired',
            detail: (error as Error).message
          }
        : {
            type: ProblemTypes.CREDENTIAL_NOT_YET_VALID,
            title: 'Credential Not Yet Valid',
            detail: (error as Error).message
          }
    ];
  }

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

  const messages = messagesOf(errors);

  // The issuer's key setup, not the content: say so, rather than accusing
  // an honestly-signed credential of having been altered.
  const verificationMethodMessage = messages.find(isVerificationMethodMessage);
  if (verificationMethodMessage !== undefined) {
    return [
      {
        type: ProblemTypes.VERIFICATION_METHOD_ERROR,
        title: 'Verification Method Error',
        detail: verificationMethodMessage
      }
    ];
  }

  return [
    {
      type: ProblemTypes.INVALID_SIGNATURE,
      title: 'Invalid Signature',
      detail: messages.join(' ') || 'The signature is not valid.'
    }
  ];
}

/**
 * The proof purpose vc checks a credential's proof against: its default
 * `CredentialIssuancePurpose` is an assertion purpose.
 */
const CREDENTIAL_PROOF_PURPOSE = 'assertionMethod';

/** The document's proof when it carries exactly one, otherwise `undefined`. */
function singleProof(
  document: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const proof = document?.proof;
  if (Array.isArray(proof)) {
    return proof.length === 1
      ? (proof[0] as Record<string, unknown>)
      : undefined;
  }
  return proof !== null && typeof proof === 'object'
    ? (proof as Record<string, unknown>)
    : undefined;
}

/**
 * Whether any configured suite would check `proof`, asked the way
 * jsonld-signatures asks: with the document's `@context` on the proof.
 */
async function anySuiteMatches(
  proof: Record<string, unknown>,
  document: Record<string, unknown>,
  suites: CryptoSuite[],
  documentLoader: unknown
): Promise<boolean> {
  const proofWithContext = { '@context': document['@context'], ...proof };
  for (const suite of suites) {
    try {
      if (
        await suite.matchProof({
          proof: proofWithContext,
          document,
          documentLoader
        })
      ) {
        return true;
      }
    } catch {
      // A suite that cannot even look at the proof does not support it.
    }
  }
  return false;
}

/**
 * Say why jsonld-signatures checked no proof, so that a warning about an
 * extra proof in a proof set names the real reason. jsonld-signatures
 * skips a proof for a purpose mismatch or for having no matching suite,
 * and reports both the same way; asking the suites tells them apart.
 * A document with several proofs gets a general wording, since each
 * proof may have been skipped for a different reason.
 */
async function unsupportedProofProblem(
  document: Record<string, unknown> | undefined,
  suites: CryptoSuite[],
  expectedPurpose: string,
  documentLoader: unknown
): Promise<ProblemDetail> {
  let detail =
    'No proof in this document could be checked: none uses a cryptosuite this verifier supports with the expected proof purpose.';
  const proof = singleProof(document);
  if (document && proof) {
    if (!(await anySuiteMatches(proof, document, suites, documentLoader))) {
      detail = `This verifier does not support this proof's cryptosuite (${proofLabel(proof)}).`;
    } else if (proof.proofPurpose !== expectedPurpose) {
      detail = `This proof's purpose (${String(proof.proofPurpose ?? 'none')}) is not the one being checked (${expectedPurpose}).`;
    }
  }
  return {
    type: ProblemTypes.PROOF_UNSUPPORTED,
    title: 'Unsupported Proof',
    detail
  };
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
          checkStatus: noopCheckStatus,
          // vc checks validity dates after the proof verifies; `now`
          // is the caller's clock, and vc falls back to its own when
          // it is undefined.
          now: options.now
        });

        const verified = result.verified ?? false;
        if (verified) {
          return {
            verified: true,
            message: 'Signature verified successfully.'
          };
        }

        if (isJsigsNoMatch(result.error)) {
          return {
            verified: false,
            problems: [
              await unsupportedProofProblem(
                credential as Record<string, unknown> | undefined,
                suites,
                CREDENTIAL_PROOF_PURPOSE,
                options.documentLoader
              )
            ]
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

        if (isJsigsNoMatch(result.error)) {
          return {
            verified: false,
            problems: [
              await unsupportedProofProblem(
                presentation as Record<string, unknown> | undefined,
                suites,
                purpose.term,
                options.documentLoader
              )
            ]
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
