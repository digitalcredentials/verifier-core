/**
 * Strict Zod schema for the OB 3.0 OpenBadgeCredential envelope.
 *
 * Phase-2 scope: top-level envelope only. Inner classes
 * (`AchievementSubject`, `Achievement`, `Profile`, `Image`,
 * `Result`, etc.) stay `passthrough` and are filled in by Phases
 * 3–7. The cross-field VCDM v1/v2 date discriminator
 * (`issuanceDate` vs `validFrom`) lives here.
 *
 * @see `docs/plans/2026-04-18-openbadges-recognizer-and-subchecks/02-envelope-and-date-discriminator.md`
 */

import { z } from 'zod';
import {
  IriString,
  JsonLdTypeField,
  Obv3p0ContextArray,
  VCDM_V1_CONTEXT,
  VCDM_V2_CONTEXT,
  zodErrorToProblems
} from './fields-v3p0.js';
import {
  ImageField,
  Obv3p0AchievementSubjectSchema,
  ProfileRefField
} from './classes-v3p0.js';
import type { RecognitionResult } from '../../types/recognition.js';

const OBV3P0_OPENBADGE_PROFILE = 'obv3p0.openbadge';

const TypeField = JsonLdTypeField(['VerifiableCredential']).superRefine(
  (arr, ctx) => {
    if (
      !arr.includes('AchievementCredential') &&
      !arr.includes('OpenBadgeCredential')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "type must include 'AchievementCredential' or 'OpenBadgeCredential'",
        path: []
      });
    }
  }
);

/**
 * The composed envelope schema. Annotated as `z.ZodTypeAny` on
 * the public export to break the inferred-type chain — without
 * this, `tsc --declaration` runs into TS7056 ("inferred type
 * exceeds the maximum length the compiler will serialize")
 * because the union/refine layers compound across every nested
 * class schema (Phase 7 was the straw that broke the camel's
 * back). Runtime behavior is unaffected; consumers narrow
 * `Obv3p0OpenBadgeCredential` (typed as a permissive record
 * below) at use, typically via `recognizedProfile`.
 */
export const Obv3p0OpenBadgeCredentialSchema: z.ZodTypeAny = z
  .object({
    '@context': Obv3p0ContextArray,
    id: IriString,
    type: TypeField,
    issuer: ProfileRefField(),
    issuanceDate: z.string().datetime({ offset: true }).optional(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    image: ImageField().optional(),
    credentialSubject: Obv3p0AchievementSubjectSchema
  })
  .passthrough()
  .superRefine((cred, ctx) => {
    const ctxArr = cred['@context'];
    const head = ctxArr[0];
    if (head === VCDM_V1_CONTEXT && cred.issuanceDate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['issuanceDate'],
        message: 'issuanceDate is required for VCDM v1 credentials'
      });
    }
    if (head === VCDM_V2_CONTEXT && cred.validFrom === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validFrom'],
        message: 'validFrom is required for VCDM v2 credentials'
      });
    }
  });

/**
 * The normalized OB 3.0 OpenBadgeCredential shape produced by
 * {@link parseObv3p0OpenBadgeCredential}.
 *
 * Typed as `Record<string, unknown>` because the strict envelope
 * inference is too deep to emit as a `.d.ts` (see schema export's
 * note on TS7056). Consumers that need deeper static typing
 * should narrow with `recognizedProfile === 'obv3p0.openbadge'`
 * and then cast to a domain-specific interface; runtime
 * validation has already proven the shape.
 */
export type Obv3p0OpenBadgeCredential = Record<string, unknown>;

/**
 * Parse an unknown into an `Obv3p0OpenBadgeCredential`. Returns a
 * {@link RecognitionResult} suitable for direct use as a
 * `RecognizerSpec.parse` implementation.
 */
export function parseObv3p0OpenBadgeCredential(
  credential: unknown
): RecognitionResult {
  const parsed = Obv3p0OpenBadgeCredentialSchema.safeParse(credential);
  if (parsed.success) {
    return {
      status: 'recognized',
      profile: OBV3P0_OPENBADGE_PROFILE,
      normalized: parsed.data
    };
  }
  return {
    status: 'malformed',
    profile: OBV3P0_OPENBADGE_PROFILE,
    problems: zodErrorToProblems(parsed.error)
  };
}
