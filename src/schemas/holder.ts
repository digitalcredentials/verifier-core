import { z } from 'zod';
import { withMessage } from './messages.js';

/**
 * The `holder` of a verifiable presentation.
 *
 * VCDM 2.0: "If present, the value MUST be either a URL or an object
 * containing an id property." Deliberately not `IssuerSchema`: a holder
 * carries no issuer-specific fields.
 */
export const HolderObjectSchema = z.object({ id: z.string() }).passthrough();

export const HolderSchema = z.union(
  [z.string(), HolderObjectSchema],
  withMessage('"holder" must be a string or an object with a string "id".')
);
export type Holder = z.infer<typeof HolderSchema>;
