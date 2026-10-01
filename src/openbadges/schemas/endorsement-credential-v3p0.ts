/**
 * Strict Zod schema for the OB 3.0 EndorsementCredential envelope (§B.1.7) and
 * its `EndorsementSubject` (§B.1.8).
 *
 * **envelope recognition only**. No semantic checks for endorsement content, no
 * auto-walk of `issuer.endorsement[]` / `achievement.endorsement[]` /
 * `credentialSubject.endorsement[]`, no recursive verification. Consumers who
 * want endorsement verification today extract embedded endorsements themselves
 * and call `verifier.verifyCredential(endorsement)` — recognition surfaces the
 * typed normalized form on the result so they can branch on `recognizedProfile
 * === 'obv3p0.endorsement'`.
 *
 * Reuses inner-class schemas (`Obv3p0Image`, `ProfileRefField`,
 * `JsonLdTypeField`) and shared envelope helpers (`Obv3p0ContextArray`,
 * `zodErrorToProblems`).
 *
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
import { ImageField, ProfileRefField } from './classes-v3p0.js';
import type { RecognitionResult } from '../../types/recognition.js';

const OBV3P0_ENDORSEMENT_PROFILE = 'obv3p0.endorsement';

/**
 * Open Badges 3.0 §B.1.8 — EndorsementSubject.
 *
 * Required: `id` (URI/IRI), `type` (must include 'EndorsementSubject').
 * Optional in scope: `endorsementComment` (Markdown ≅ string).
 *
 * `passthrough` is used so vendor-extension fields survive
 * normalization without being silently dropped.
 */
export const Obv3p0EndorsementSubjectSchema = z
  .object({
    id: IriString,
    type: JsonLdTypeField(['EndorsementSubject']),
    endorsementComment: z.string().optional()
  })
  .passthrough();

export type Obv3p0EndorsementSubject = z.infer<
  typeof Obv3p0EndorsementSubjectSchema
>;

const TypeField = JsonLdTypeField(['VerifiableCredential']).superRefine(
  (arr, ctx) => {
    if (!arr.includes('EndorsementCredential')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "type must include 'EndorsementCredential'",
        path: []
      });
    }
  }
);

/**
 * Open Badges 3.0 §B.1.7 — EndorsementCredential envelope.
 *
 * Same TS7056 footnote as the OpenBadgeCredential envelope
 * applies: deep nesting (ProfileRef + Image + EndorsementSubject)
 * pushes inferred type emit past the compiler's serialization
 * limit, so the public export is annotated `z.ZodTypeAny` and the
 * companion type alias collapses to `Record<string, unknown>`.
 * Runtime behavior is unaffected; consumers narrow via
 * `recognizedProfile === 'obv3p0.endorsement'` and cast to a
 * domain interface as needed.
 */
export const Obv3p0EndorsementCredentialSchema: z.ZodTypeAny = z
  .object({
    '@context': Obv3p0ContextArray,
    id: IriString,
    type: TypeField,
    name: z.string(),
    description: z.string().optional(),
    issuer: ProfileRefField(),
    issuanceDate: z.string().datetime({ offset: true }).optional(),
    validFrom: z.string().datetime({ offset: true }).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    awardedDate: z.string().datetime({ offset: true }).optional(),
    image: ImageField().optional(),
    credentialSubject: Obv3p0EndorsementSubjectSchema
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
 * The normalized OB 3.0 EndorsementCredential shape produced by
 * {@link parseObv3p0EndorsementCredential}. See the schema export's
 * note on TS7056 for why this is typed as a permissive record.
 */
export type Obv3p0EndorsementCredential = Record<string, unknown>;

/**
 * Parse an unknown into an `Obv3p0EndorsementCredential`. Returns
 * a {@link RecognitionResult} suitable for direct use as a
 * `RecognizerSpec.parse` implementation.
 */
export function parseObv3p0EndorsementCredential(
  credential: unknown
): RecognitionResult {
  const parsed = Obv3p0EndorsementCredentialSchema.safeParse(credential);
  if (parsed.success) {
    return {
      status: 'recognized',
      profile: OBV3P0_ENDORSEMENT_PROFILE,
      normalized: parsed.data
    };
  }
  return {
    status: 'malformed',
    profile: OBV3P0_ENDORSEMENT_PROFILE,
    problems: zodErrorToProblems(parsed.error)
  };
}
