import { z } from 'zod';
import { withMessage } from './messages.js';

/**
 * A credential `issuer`: a URL string, or an object with a string `id`.
 * Every other issuer property (`name`, `image`, `url`, ...) passes
 * through unchecked; `core.vc-structure` checks that the `id` is a URL.
 */
export const IssuerSchema = z.union(
  [z.string(), z.object({ id: z.string() }).passthrough()],
  withMessage(
    '"issuer" is required and must be a string or an object with a string "id".'
  )
);
export type Issuer = z.infer<typeof IssuerSchema>;
