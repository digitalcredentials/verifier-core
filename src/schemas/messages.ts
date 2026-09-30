import type { z } from 'zod';

/**
 * Schema params that replace every issue a schema raises itself with one
 * plain, self-contained message. Zod's defaults for a union ("Invalid
 * input") say neither which field failed nor what was expected, and the
 * parse-failure detail shows these messages verbatim.
 */
export function withMessage(message: string): z.RawCreateParams {
  return { errorMap: () => ({ message }) };
}
