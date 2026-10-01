import { z } from 'zod';
import { JsonLdField } from './jsonld-field.js';
import { ProofSchema } from './proof.js';
import { CredentialSchema } from './credential.js';
import { HolderSchema } from './holder.js';

export const PresentationSchema = z
  .object({
    '@context': JsonLdField(z.union([z.string(), z.record(z.unknown())])),
    type: JsonLdField(z.string()),
    verifiableCredential: z
      .union([CredentialSchema, z.array(CredentialSchema)])
      .optional(),
    holder: HolderSchema.optional(),
    proof: z.union([ProofSchema, z.array(ProofSchema)]).optional()
  })
  .passthrough();

export type VerifiablePresentation = z.infer<typeof PresentationSchema>;

export function parsePresentation(
  input: unknown
): z.SafeParseReturnType<unknown, VerifiablePresentation> {
  return PresentationSchema.safeParse(input);
}
