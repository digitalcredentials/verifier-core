import { z } from 'zod';

/**
 * The `holder` of a verifiable presentation.
 *
 * VCDM 2.0: "If present, the value MUST be either a URL or an object
 * containing an id property." Deliberately not `IssuerSchema`: a holder
 * carries no issuer-specific fields.
 */
export const HolderObjectSchema = z.object({ id: z.string() }).passthrough();

export const HolderSchema = z.union([z.string(), HolderObjectSchema]);
export type Holder = z.infer<typeof HolderSchema>;
