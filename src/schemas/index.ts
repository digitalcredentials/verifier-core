/**
 * Schema parsing and validation utilities.
 *
 * This module provides Zod-based parsing for Verifiable Credentials
 * and Verifiable Presentations.
 */

export {
  parseCredential,
  CredentialSchema,
  CredentialV1Schema,
  CredentialV2Schema
} from './credential.js';
export type { VerifiableCredential } from './credential.js';

export { parsePresentation, PresentationSchema } from './presentation.js';
export type { VerifiablePresentation } from './presentation.js';

export { IssuerSchema, IssuerObjectSchema } from './issuer.js';
export type { Issuer } from './issuer.js';

export { HolderSchema, HolderObjectSchema } from './holder.js';
export type { Holder } from './holder.js';

export { ProofSchema } from './proof.js';
export type { Proof } from './proof.js';

export { JsonLdField, JsonLdFieldAllowEmpty } from './jsonld-field.js';
