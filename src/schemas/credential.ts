import { z } from 'zod';
import { IssuerSchema } from './issuer.js';
import { withMessage } from './messages.js';

/** One `@context` entry: a URL string or an inline context object. */
const ContextEntrySchema = z.union([z.string(), z.record(z.unknown())]);

/** `@context` as a single entry or an array of entries. */
export const ContextSchema = z.union(
  [ContextEntrySchema, z.array(ContextEntrySchema)],
  withMessage(
    '"@context" is required and must be a string, a context object, or an array of them.'
  )
);

/** `type` as a single string or an array of strings. */
export const TypeSchema = z.union(
  [z.string(), z.array(z.string())],
  withMessage('"type" is required and must be a string or an array of strings.')
);

/**
 * The minimal envelope a credential needs before any suite runs:
 * `@context`, `type`, `issuer` and `credentialSubject`, in shapes the
 * pipeline can read. Every other property passes through untouched.
 *
 * This is deliberately not a VC Data Model validator. Structural
 * requirements are judged by the `core.vc-structure` check, which
 * reports each violation with a JSON Pointer.
 */
export const CredentialSchema = z
  .object(
    {
      '@context': ContextSchema,
      type: TypeSchema,
      issuer: IssuerSchema,
      credentialSubject: z.union(
        [z.record(z.unknown()), z.array(z.record(z.unknown()))],
        withMessage(
          '"credentialSubject" is required and must be an object or an array of objects.'
        )
      )
    },
    withMessage('The credential must be a JSON object.')
  )
  .passthrough();
export type VerifiableCredential = z.infer<typeof CredentialSchema>;

const ENVELOPED_CREDENTIAL_TYPE = 'EnvelopedVerifiableCredential';

/** Whether `input` is an object whose `type` names an enveloped credential. */
function isEnvelopedCredential(input: unknown): boolean {
  if (input === null || typeof input !== 'object') {
    return false;
  }
  const type = (input as { type?: unknown }).type;
  const types = Array.isArray(type) ? type : [type];
  return types.includes(ENVELOPED_CREDENTIAL_TYPE);
}

/**
 * Apply the minimal envelope gate that `verifyCredential` runs before
 * any suite. It checks only that `@context`, `type`, `issuer` and
 * `credentialSubject` are present and readable (see
 * {@link CredentialSchema}), and rejects enveloped credentials
 * (`EnvelopedVerifiableCredential`, i.e. VC-JOSE-COSE), which this
 * verifier does not support.
 *
 * This is not a VC Data Model validator: a credential that passes may
 * still fail `core.vc-structure`. The parsed `data` is for inspection
 * only; `verifyCredential` verifies the caller's original object.
 *
 * Returns the zod result (success or error) — callers decide how to
 * handle failures.
 */
export function parseCredential(
  input: unknown
): z.SafeParseReturnType<unknown, VerifiableCredential> {
  if (isEnvelopedCredential(input)) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['type'],
          message:
            'Enveloped credentials (VC-JOSE-COSE) are not supported by this verifier.'
        }
      ])
    };
  }
  return CredentialSchema.safeParse(input);
}
