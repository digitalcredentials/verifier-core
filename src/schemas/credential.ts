import { z } from 'zod';
import { JsonLdField } from './jsonld-field.js';
import { IssuerSchema } from './issuer.js';
import { ProofSchema } from './proof.js';

const ContextSchema = JsonLdField(z.union([z.string(), z.record(z.unknown())]));

const CredentialStatusSchema = z
  .object({
    id: z.string(),
    /** Preserve string vs array — normalizing to array breaks LD signature verification. */
    type: z.union([z.string(), z.array(z.string())]),
    statusPurpose: z.string(),
    statusListIndex: z.union([z.string(), z.number()]),
    statusListCredential: z.string()
  })
  .passthrough();

const CredentialSchemaSchema = z
  .object({
    id: z.string(),
    type: z.string()
  })
  .passthrough();

const BaseCredentialSchema = z
  .object({
    '@context': ContextSchema,
    id: z.string().optional(),
    type: JsonLdField(z.string()),
    issuer: IssuerSchema,
    credentialSubject: z.record(z.unknown()).or(z.array(z.record(z.unknown()))),
    proof: z.union([ProofSchema, z.array(ProofSchema)]).optional(),
    credentialStatus: z
      .union([CredentialStatusSchema, z.array(CredentialStatusSchema)])
      .optional(),
    credentialSchema: z
      .union([CredentialSchemaSchema, z.array(CredentialSchemaSchema)])
      .optional(),
    name: z.string().optional()
  })
  .passthrough();

// VC v1 adds issuanceDate/expirationDate
export const CredentialV1Schema = BaseCredentialSchema.extend({
  issuanceDate: z.string(),
  expirationDate: z.string().optional()
});

// VC v2 adds validFrom/validUntil
export const CredentialV2Schema = BaseCredentialSchema.extend({
  validFrom: z.string().optional(),
  validUntil: z.string().optional()
});

export const CredentialSchema = z.union([
  CredentialV1Schema,
  CredentialV2Schema
]);
export type VerifiableCredential = z.infer<typeof CredentialSchema>;

/**
 * Parse unknown input into a VerifiableCredential.
 * Returns the zod result (success or error) — callers decide how to handle failures.
 */
export function parseCredential(
  input: unknown
): z.SafeParseReturnType<unknown, VerifiableCredential> {
  return CredentialSchema.safeParse(input);
}
