import { z } from 'zod';
import { ContextSchema, TypeSchema } from './credential.js';
import { HolderSchema } from './holder.js';
import { withMessage } from './messages.js';

/**
 * The minimal envelope a presentation needs before any suite runs:
 * `@context` and `type`, plus `holder` when present. Every other
 * property, including `verifiableCredential` and `proof`, passes through
 * untouched.
 *
 * Embedded credentials are not validated here: `verifyPresentation`
 * gates and verifies each one separately with `verifyCredential`, and
 * the presentation's structure is judged by the `core.vp-structure`
 * check.
 */
export const PresentationSchema = z
  .object(
    {
      '@context': ContextSchema,
      type: TypeSchema,
      holder: HolderSchema.optional()
    },
    withMessage('The presentation must be a JSON object.')
  )
  .passthrough();

export type VerifiablePresentation = z.infer<typeof PresentationSchema>;

/**
 * Apply the minimal envelope gate that `verifyPresentation` runs before
 * any suite (see {@link PresentationSchema}).
 *
 * This is not a VC Data Model validator: a presentation that passes may
 * still fail `core.vp-structure`, and its embedded credentials may each
 * fail their own gate. The parsed `data` is for inspection only;
 * `verifyPresentation` verifies the caller's original object.
 */
export function parsePresentation(
  input: unknown
): z.SafeParseReturnType<unknown, VerifiablePresentation> {
  return PresentationSchema.safeParse(input);
}
