import { z } from 'zod';

/** Accepts T or T[] and normalizes to T[] */
export function JsonLdField<T extends z.ZodTypeAny>(schema: T) {
  return z
    .union([schema, z.array(schema)])
    .transform(v => (Array.isArray(v) ? v : [v]));
}

/** Like JsonLdField but allows empty array */
export function JsonLdFieldAllowEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z
    .union([schema, z.array(schema)])
    .transform(v => (Array.isArray(v) ? v : [v]));
}
