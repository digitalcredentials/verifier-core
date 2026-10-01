/**
 * Internal Zod shapes for OpenBadges 3.0 credential structures.
 *
 * These are the parsing primitives used by the OpenBadges submodule's checks.
 * They are intentionally **tolerant**:
 *
 * - Every field is `.optional()` and every object is `.passthrough()`. OBv3
 *   credentials carry many spec-defined and extension fields we neither need
 *   nor want to strip or reject. Per-check logic is responsible for asserting
 *   which subset of fields it requires.
 * - `id` (and other normally-required fields) is modeled as
 *   `.string().optional()` so a single non-conforming entry inside an array
 *   (e.g. one `resultDescription` missing `id`) does not cause `safeParse` to
 *   fail the whole credential and silently skip the check. Callers filter at
 *   the point of use.
 *
 * These shapes are **not** exported from the submodule barrel in this plan —
 * they are an internal implementation detail of the checks. A future effort can
 * promote them (or a curated subset) to the public surface if it would be
 * useful for consumer business logic.
 *
 * Shape coverage tracks what every check planned in the
 * 2026-04-18-openbadges-module plan needs to read:
 *
 * - `Obv3ResultShape`            — `result-ref`, `achieved-level`,
 *                                  `missing-result-status`
 * - `Obv3ResultDescriptionShape` — `result-ref`, `achieved-level`
 * - `Obv3AchievementShape`       — `result-ref`, `achieved-level`,
 *                                  `unknown-achievement-type`
 * - `Obv3CredentialSubjectShape` — top-level entry shape used by all
 *                                  checks via
 *                                  `safeParse(credential.credentialSubject)`.
 *
 * ## Why these are kept alongside the strict `Obv3p0OpenBadgeCredentialSchema`
 *
 * The 2026-04-18 P-C plan introduced a strict envelope schema in
 * `schemas/classes-v3p0.ts` and `schemas/openbadge-credential-v3p0.ts` that
 * validates an OB 3.0 credential top-to-bottom. That schema powers the
 * recognition pipeline (`obv3p0Recognizer`) and the public
 * `recognition.profile` check.
 *
 * The cross-field semantic checks below intentionally **do not** adopt the
 * strict schema for parsing. The two regimes serve different purposes:
 *
 * - **Strict envelope** answers "is this a well-formed OB 3.0 credential?" — a
 *   binary, top-to-bottom precondition that gates trust signals and surfaces
 *   every shape violation with an `instance` JSON Pointer.
 * - **Tolerant semantic shapes** answer "given a credential the issuer asserts
 *   is OB-shaped, do its cross-references hang together?" — a per-rule
 *   observation that should still fire when one nearby field is malformed. A
 *   `RubricCriterionLevel` missing `name` should not silence the `result-ref`
 *   check on a valid sibling.
 *
 * Refactoring these checks to consume the strict normalized form was explicitly
 * considered and rejected: the resilience gain from per-rule scoping outweighs
 * the deduplication win, and consumers who want strict envelope feedback get it
 * from the recognition pipeline directly.
 */

import { z } from 'zod';

const RubricCriterionLevelShape = z
  .object({
    id: z.string().optional()
  })
  .passthrough();

export const Obv3ResultDescriptionShape = z
  .object({
    id: z.string().optional(),
    resultType: z.string().optional(),
    rubricCriterionLevel: z.array(RubricCriterionLevelShape).optional()
  })
  .passthrough();

export const Obv3ResultShape = z
  .object({
    resultDescription: z.string().optional(),
    achievedLevel: z.string().optional(),
    status: z.string().optional()
  })
  .passthrough();

export const Obv3AchievementShape = z
  .object({
    /**
     * Spec shape is `string | string[]`, but we model as `unknown`
     * for tolerance — the unknown-achievement-type check ignores
     * non-string entries by design (shape validity is a separate
     * concern), and modeling strictly here would cause one bad
     * entry to fail the entire `safeParse` and silently skip the
     * whole check.
     */
    achievementType: z.unknown(),
    resultDescription: z.array(Obv3ResultDescriptionShape).optional()
  })
  .passthrough();

export const Obv3CredentialSubjectShape = z
  .object({
    achievement: Obv3AchievementShape.optional(),
    result: z.array(Obv3ResultShape).optional()
  })
  .passthrough();
