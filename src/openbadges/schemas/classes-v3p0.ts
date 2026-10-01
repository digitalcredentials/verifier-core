/**
 * Open Badges 3.0 inner-class schemas.
 *
 * **Colocation note**: the per-class `*Field()` builders live in
 * this file alongside their schemas (rather than in
 * `fields-v3p0.ts`) to avoid an ESM circular-import deadlock —
 * the schemas use `JsonLdTypeField` at module-evaluation time, so
 * splitting them across files would put `JsonLdTypeField` in TDZ
 * when `classes-v3p0.ts` first runs. The `fields-v3p0.ts` file
 * stays focused on field builders that don't depend on a class
 * schema (constants, `IriString`, `JsonLdTypeField`,
 * `ProfileRefField`).
 */

import { z } from 'zod';
import { IriString, JsonLdTypeField } from './fields-v3p0.js';

/**
 * Open Badges 3.0 §B.1.13 — Image class.
 *
 * Required: `id` (IRI; data URIs allowed), `type` (must include
 * `'Image'`).
 * Optional: `caption`.
 *
 * The IMS JSON Schema types `type` as the string `'Image'` (or a
 * language map). JSON-LD also emits `['Image']`, so both are
 * accepted. Unlike {@link JsonLdTypeField}, this does not rewrite
 * a string into an array — the issued form is what parse returns.
 *
 * `id` uses {@link IriString} rather than `z.string().url()` so
 * `data:image/png;base64,...` URIs (allowed by the spec) and
 * other non-URL IRIs are accepted. Strict format validation is
 * the AJV JSON Schema check's job.
 */

const ImageType = z
  .union([z.string(), z.array(z.string())])
  .superRefine((value, ctx) => {
    const types = Array.isArray(value) ? value : [value];
    if (!types.includes('Image')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "type must include 'Image'"
      });
    }
  });

export const Obv3p0ImageSchema = z
  .object({
    id: IriString,
    type: ImageType,
    caption: z.string().optional()
  })
  .passthrough();

export type Obv3p0Image = z.infer<typeof Obv3p0ImageSchema>;

/**
 * Field builder for Image-valued slots.
 *
 * OB 3.0 permits an Image-typed property to be either:
 * - a string IRI (an image URL or data URI), or
 * - a full Image object.
 *
 * This builder normalizes the string form to
 * `{ id, type: 'Image' }` so consumers can always treat the
 * field as an object. Object-form `type` is left as issued.
 */
export function ImageField() {
  return z.union([
    IriString.transform(id => ({ id, type: 'Image' })),
    Obv3p0ImageSchema
  ]);
}

/**
 * Open Badges 3.0 §B.1.14 — Profile class.
 *
 * Required: `id` (IRI; DIDs accepted), `type` (must include
 * `'Profile'`).
 *
 * In-scope optional fields per the design (Q4.c): `name`, `url`,
 * `description`, `image`, `email`. Email validation is light
 * (`@`-presence) — full RFC-5321 conformance is out of scope.
 *
 * Recursive Profile-typed fields (e.g. `parentOrg`) stay
 * passthrough; supporting them needs `z.lazy()` and is out of
 * scope per the parent plan's Q4.c.
 *
 * `id` uses {@link IriString} rather than `z.string().url()` so
 * `did:`-prefixed identifiers (the most common issuer form) are
 * accepted. `url` (a webpage URL) keeps `z.string().url()`.
 */
export const Obv3p0ProfileSchema = z
  .object({
    id: IriString,
    type: JsonLdTypeField(['Profile']),
    name: z.string().optional(),
    url: z.string().url().optional(),
    description: z.string().optional(),
    image: ImageField().optional(),
    email: z
      .string()
      .refine(s => s.includes('@'), { message: 'email must contain "@"' })
      .optional()
  })
  .passthrough();

export type Obv3p0Profile = z.infer<typeof Obv3p0ProfileSchema>;

/**
 * Field builder for Profile-valued slots (issuer, creator, etc.).
 *
 * OB 3.0 permits a Profile-typed property to be either:
 * - a string IRI, or
 * - a full Profile object.
 *
 * Normalizes the string form to `{ id, type: ['Profile'] }` so
 * consumers can always treat the value as an object.
 */
export function ProfileRefField() {
  return z.union([
    IriString.transform(id => ({ id, type: ['Profile'] })),
    Obv3p0ProfileSchema
  ]);
}

/**
 * Open Badges 3.0 §B.1.5 — Alignment class.
 *
 * Required: `type` (must include `'Alignment'`), `targetName`,
 * `targetUrl`. Optional in scope: `targetCode`,
 * `targetDescription`, `targetFramework`, `targetType`.
 *
 * `targetUrl` keeps `z.string().url()` — alignments point to
 * webpages describing the framework target, not generic IRIs.
 */
export const Obv3p0AlignmentSchema = z
  .object({
    type: JsonLdTypeField(['Alignment']),
    targetName: z.string(),
    targetUrl: z.string().url(),
    targetCode: z.string().optional(),
    targetDescription: z.string().optional(),
    targetFramework: z.string().optional(),
    targetType: z.string().optional()
  })
  .passthrough();

export type Obv3p0Alignment = z.infer<typeof Obv3p0AlignmentSchema>;

/**
 * Open Badges 3.0 §B.1.18 — RubricCriterionLevel class.
 *
 * Required: `id`, `type` (must include `'RubricCriterionLevel'`),
 * `name`. Optional in scope: `alignment[]`, `description`,
 * `level`, `points`.
 *
 * Referenced from
 * {@link Obv3p0ResultDescriptionSchema}.`rubricCriterionLevel[]`,
 * and from {@link Obv3p0ResultSchema}.`achievedLevel` (by IRI).
 */
export const Obv3p0RubricCriterionLevelSchema = z
  .object({
    id: z.string().url(),
    type: JsonLdTypeField(['RubricCriterionLevel']),
    name: z.string(),
    alignment: z.array(Obv3p0AlignmentSchema).optional(),
    description: z.string().optional(),
    level: z.string().optional(),
    points: z.string().optional()
  })
  .passthrough();

export type Obv3p0RubricCriterionLevel = z.infer<
  typeof Obv3p0RubricCriterionLevelSchema
>;

/**
 * Open Badges 3.0 §B.1.17 — ResultDescription class.
 *
 * Required: `id`, `type` (must include `'ResultDescription'`),
 * `name`, `resultType`. Optional in scope: `alignment[]`,
 * `allowedValue[]`, `requiredLevel` (IRI ref into a
 * RubricCriterionLevel), `requiredValue`,
 * `rubricCriterionLevel[]`, `valueMax`, `valueMin`.
 *
 * Backfilled into {@link Obv3p0AchievementSchema}.`resultDescription[]`.
 */
export const Obv3p0ResultDescriptionSchema = z
  .object({
    id: z.string().url(),
    type: JsonLdTypeField(['ResultDescription']),
    name: z.string(),
    resultType: z.string(),
    alignment: z.array(Obv3p0AlignmentSchema).optional(),
    allowedValue: z.array(z.string()).optional(),
    requiredLevel: z.string().url().optional(),
    requiredValue: z.string().optional(),
    rubricCriterionLevel: z.array(Obv3p0RubricCriterionLevelSchema).optional(),
    valueMax: z.string().optional(),
    valueMin: z.string().optional()
  })
  .passthrough();

export type Obv3p0ResultDescription = z.infer<
  typeof Obv3p0ResultDescriptionSchema
>;

/**
 * Open Badges 3.0 §B.1.16 — Result class.
 *
 * Required: `type` (must include `'Result'`).
 * Optional in scope: `achievedLevel` (IRI ref to a
 * RubricCriterionLevel), `alignment[]`, `resultDescription` (IRI
 * ref to an `Obv3p0ResultDescriptionSchema` entry inside the same
 * credential's `Achievement.resultDescription[]`), `status`,
 * `value`.
 *
 * **Note**: `Result.resultDescription` is a string IRI cross-
 * referencing an entry in `Achievement.resultDescription[]`. The
 * existing `obv3-result-ref-check` (refactored in Phase 8 to use
 * the normalized form) verifies that the reference resolves;
 * this schema only validates that the field is a syntactically
 * valid URL string.
 *
 * Backfilled into {@link Obv3p0AchievementSubjectSchema}.`result[]`.
 */
export const Obv3p0ResultSchema = z
  .object({
    type: JsonLdTypeField(['Result']),
    achievedLevel: z.string().url().optional(),
    alignment: z.array(Obv3p0AlignmentSchema).optional(),
    resultDescription: z.string().url().optional(),
    status: z.string().optional(),
    value: z.string().optional()
  })
  .passthrough();

export type Obv3p0Result = z.infer<typeof Obv3p0ResultSchema>;

/**
 * Open Badges 3.0 §B.1.6 — Criteria class (file-local).
 *
 * Both `id` and `narrative` are optional per spec — Criteria is a
 * discoverability hint, an empty object is structurally valid.
 * Kept private to this module; callers reach it via
 * `Obv3p0AchievementSchema.criteria`.
 */
const Obv3p0CriteriaSchema = z
  .object({
    id: z.string().url().optional(),
    narrative: z.string().optional()
  })
  .passthrough();

/**
 * Open Badges 3.0 §B.1.1 — Achievement class.
 *
 * Required: `id`, `type` (must include `'Achievement'`),
 * `criteria`, `description`, `name`.
 *
 * Optional in scope:
 * - `alignment[]` — array of {@link Obv3p0AlignmentSchema}.
 * - `creator` — Profile (normalized via {@link ProfileRefField}).
 * - `image` — Image (normalized via {@link ImageField}).
 * - `resultDescription[]` — array of
 *   {@link Obv3p0ResultDescriptionSchema} (Phase 7).
 *
 * Wired into `AchievementSubject.achievement` in Phase 6.
 */
export const Obv3p0AchievementSchema = z
  .object({
    id: z.string().url(),
    type: JsonLdTypeField(['Achievement']),
    criteria: Obv3p0CriteriaSchema,
    description: z.string(),
    name: z.string(),
    alignment: z.array(Obv3p0AlignmentSchema).optional(),
    creator: ProfileRefField().optional(),
    image: ImageField().optional(),
    resultDescription: z.array(Obv3p0ResultDescriptionSchema).optional()
  })
  .passthrough();

export type Obv3p0Achievement = z.infer<typeof Obv3p0AchievementSchema>;

/**
 * Open Badges 3.0 §B.1.12 — IdentityObject (file-local).
 *
 * Used inside `AchievementSubject.identifier[]` entries. Kept
 * light per Q4.c — passthrough with a required `type`
 * discriminator. Full hashed-identity validation (§9.3) is out of
 * scope.
 */
const Obv3p0IdentityObjectSchema = z
  .object({
    type: JsonLdTypeField(['IdentityObject'])
  })
  .passthrough();

/**
 * Open Badges 3.0 §B.1.3 — AchievementSubject class.
 *
 * Required: `type` (must include `'AchievementSubject'`),
 * `achievement`.
 *
 * **At-least-one refinement**: per spec the recipient must be
 * identified by `id` (an IRI) **or** by a non-empty `identifier[]`
 * (structured identifier objects). Both are also permitted. The
 * refinement raises a single problem at the subject root path
 * when neither is present, which surfaces as
 * `/credentialSubject` once backfilled into the envelope.
 *
 * Optional in scope: `result[]` (array of
 * {@link Obv3p0ResultSchema}, Phase 7), `image` (normalized via
 * {@link ImageField}), `identifier[]` (entries kept light per the
 * IdentityObject note above).
 */
export const Obv3p0AchievementSubjectSchema = z
  .object({
    type: JsonLdTypeField(['AchievementSubject']),
    achievement: Obv3p0AchievementSchema,
    id: z.string().url().optional(),
    identifier: z.array(Obv3p0IdentityObjectSchema).optional(),
    result: z.array(Obv3p0ResultSchema).optional(),
    image: ImageField().optional()
  })
  .passthrough()
  .superRefine((subject, ctx) => {
    const hasId = typeof subject.id === 'string' && subject.id.length > 0;
    const hasIdentifier =
      Array.isArray(subject.identifier) && subject.identifier.length > 0;
    if (!hasId && !hasIdentifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message:
          'AchievementSubject requires either id or non-empty identifier[]'
      });
    }
  });

export type Obv3p0AchievementSubject = z.infer<
  typeof Obv3p0AchievementSubjectSchema
>;
