/**
 * Reusable Zod field builders + envelope helpers for the strict OB
 * 3.0 schemas (`openbadge-credential-v3p0.ts`,
 * `endorsement-credential-v3p0.ts`).
 *
 * - **Context constants** for VCDM v1, VCDM v2, and the OB 3.0
 *   context prefix (matched with `startsWith` so patch versions
 *   like `context-3.0.3.json` and any future `context-3.0.4.json`
 *   are accepted without code change).
 * - **`IriString`** — minimal scheme-prefixed IRI matcher; accepts
 *   `urn:uuid:...`, `did:example:...`, `https://...`, etc.
 *   Z's built-in `z.string().url()` rejects URN forms common in
 *   OB credentials, so we use a tiny permissive regex instead.
 *   Strict format validation is the JSON Schema check's job.
 * - **`JsonLdTypeField(requiredTypes)`** — normalizes `string |
 *   string[]` to `string[]` and refines that every value in
 *   `requiredTypes` is present.
 * - **`Obv3p0ContextArray`** — the VCDM-context-array schema
 *   (head must be VCDM v1 or v2; the array must include an OB 3.0
 *   context).
 * - **`zodErrorToProblems(error, profile)`** — converts a
 *   `ZodError` into the `ProblemDetail[]` shape returned by the
 *   recognizer's `parse` for a malformed envelope. Centralized
 *   here so the OpenBadge and Endorsement recognizers can't drift
 *   on error shape or `instance` pointer formatting.
 *
 * Class-coupled field builders (`ImageField`, `ProfileRefField`)
 * live alongside their schemas in `classes-v3p0.ts` to avoid an
 * ESM circular import (the schemas use `JsonLdTypeField` at
 * module-evaluation time).
 */

import { z } from 'zod';
import type { ProblemDetail } from '../../types/problem-detail.js';
import { formatJsonPointer } from '../../util/json-pointer.js';

export const VCDM_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1';
export const VCDM_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
/** Matches `context-3.0.X.json` URLs across patch versions. */
export const OB_3_0_CONTEXT_PREFIX =
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3';

/**
 * Permissive IRI matcher: `scheme:rest`. Accepts `urn:uuid:...`,
 * `did:web:...`, `https://...`, etc.
 */
export const IriString = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9+.-]*:.+/, 'Expected an IRI (scheme:rest)');

/**
 * JSON-LD `type` field. Accepts `string | string[]`, normalizes to
 * `string[]`, and refines that every value in `requiredTypes` is
 * present.
 */
export function JsonLdTypeField(requiredTypes: readonly string[]) {
  return z
    .union([z.string(), z.array(z.string())])
    .transform(v => (Array.isArray(v) ? v : [v]))
    .superRefine((arr, ctx) => {
      for (const required of requiredTypes) {
        if (!arr.includes(required)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `type must include '${required}'`,
            path: []
          });
        }
      }
    });
}

/**
 * VCDM-anchored `@context` array shared by every OB 3.0 envelope
 * schema. The head must be a VCDM context (v1 or v2), and the array
 * must include an OB 3.0 context (matched with `startsWith` to
 * accept future patch versions).
 */
export const Obv3p0ContextArray = z
  .array(z.string())
  .min(1, '@context must be a non-empty array')
  .refine(arr => arr[0] === VCDM_V1_CONTEXT || arr[0] === VCDM_V2_CONTEXT, {
    message: '@context[0] must be a VCDM context (v1 or v2)'
  })
  .refine(arr => arr.some(c => c.startsWith(OB_3_0_CONTEXT_PREFIX)), {
    message: `@context must include the OB 3.0 context (${OB_3_0_CONTEXT_PREFIX}*)`
  });

const OB_MALFORMED_ENVELOPE_TYPE =
  'urn:dcc-verifier:openbadges:malformed-envelope';

/**
 * Map a `ZodError` from one of the OB 3.0 envelope schemas into the
 * `ProblemDetail[]` shape a recognizer returns when the envelope is
 * malformed. Each issue becomes one `ProblemDetail`; the issue's
 * `path` is rendered as an RFC 6901 JSON Pointer in `instance`
 * (omitted for root-level errors).
 *
 * Title is intentionally generic ("Malformed Open Badges 3.0
 * Envelope"); the per-recognizer `profile` field on the parent
 * `RecognitionResult` is the right place to disambiguate which
 * envelope flavor (OpenBadge vs Endorsement) reported the issue.
 */
export function zodErrorToProblems(error: z.ZodError): ProblemDetail[] {
  return error.issues.map(issue => {
    const detail: ProblemDetail = {
      type: OB_MALFORMED_ENVELOPE_TYPE,
      title: 'Malformed Open Badges 3.0 Envelope',
      detail: issue.message
    };
    if (issue.path.length > 0) {
      detail.instance = formatJsonPointer(issue.path);
    }
    return detail;
  });
}
