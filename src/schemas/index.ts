/**
 * Schema parsing and validation utilities.
 *
 * This module provides the minimal Zod envelope gates that
 * `verifyCredential` and `verifyPresentation` apply before any suite
 * runs. Structural validation against the VC Data Model is the job of
 * the `core` suite.
 */

export { parseCredential, CredentialSchema } from './credential.js';
export type { VerifiableCredential } from './credential.js';

export { parsePresentation, PresentationSchema } from './presentation.js';
export type { VerifiablePresentation } from './presentation.js';

export { IssuerSchema } from './issuer.js';
export type { Issuer } from './issuer.js';

export { HolderSchema, HolderObjectSchema } from './holder.js';
export type { Holder } from './holder.js';
