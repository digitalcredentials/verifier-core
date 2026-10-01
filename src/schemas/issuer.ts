import { z } from 'zod';
import { Obv3p0ImageSchema } from '../openbadges/schemas/classes-v3p0.js';

/**
 * A Profile object representing an issuer.
 *
 * Issuer `image` uses the Open Badges Image class.
 */
export const IssuerObjectSchema = z
  .object({
    id: z.string(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    name: z.string().optional(),
    url: z.string().optional(),
    image: z.union([z.string(), Obv3p0ImageSchema]).optional()
  })
  .passthrough();

export const IssuerSchema = z.union([z.string(), IssuerObjectSchema]);
export type Issuer = z.infer<typeof IssuerSchema>;
