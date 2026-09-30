/**
 * Small pure helpers shared by `core.vc-structure` and
 * `core.vp-structure`.
 *
 * Both checks read the subject defensively: nothing here assumes the
 * input has been normalised, so `@context` and `type` may be a string
 * or an array, and any property may hold a value of the wrong shape.
 */

import { dateRegex } from '@digitalcredentials/vc';
import type { ProblemDetail } from '../../types/problem-detail.js';
import { ProblemTypes } from '../../problem-types.js';
import { formatJsonPointer } from '../../util/json-pointer.js';

/** JSON Pointer segments, as accepted by {@link formatJsonPointer}. */
export type PointerSegments = Array<string | number>;

export const VC_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1';
export const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';

function isVcContext(value: unknown): boolean {
  return value === VC_CONTEXT_V1 || value === VC_CONTEXT_V2;
}

/** The first `@context` entry: the value itself when it is not an array. */
export function firstContextEntry(context: unknown): unknown {
  return Array.isArray(context) ? context[0] : context;
}

/** Whether `@context` includes either VC context anywhere. */
export function includesVcContext(context: unknown): boolean {
  return stringValues(context).some(isVcContext);
}

/**
 * Report when `@context` includes a VC context but its first entry is
 * not one, as `@digitalcredentials/vc` requires. The pointer is
 * `/@context/0` for an array and `/@context` for a single value. When
 * no VC context is present at all this reports nothing, so the caller
 * (or `core.vc-context`) reports that once, as a missing context.
 */
export function checkFirstContextEntry(
  context: unknown,
  report: (pointer: PointerSegments, detail: string) => void
): void {
  if (!includesVcContext(context) || isVcContext(firstContextEntry(context))) {
    return;
  }
  report(
    Array.isArray(context) ? ['@context', 0] : ['@context'],
    `The first "@context" entry must be "${VC_CONTEXT_V1}" or "${VC_CONTEXT_V2}".`
  );
}

/**
 * A string that `new URL()` accepts. This is the test
 * `@digitalcredentials/vc` applies to ids, and it accepts DIDs and
 * URNs (`did:…`, `urn:uuid:…`).
 */
export function isUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * An XML Schema dateTime string, tested with the `dateRegex`
 * `@digitalcredentials/vc` exports, so this check and the library
 * agree on what a valid date is.
 */
export function isDateTime(value: unknown): boolean {
  return typeof value === 'string' && dateRegex.test(value);
}

/** A non-null, non-array object. */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The string values of a JSON-LD term that may be a single string or
 * an array (`@context`, `type`). Anything else contributes nothing.
 */
export function stringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

/**
 * Normalise a single value or an array into `[entry, pointer]` pairs.
 * A single value keeps its pointer (`['credentialStatus']`); an array
 * entry gets its index appended (`['credentialStatus', 0]`).
 */
export function asEntries(
  value: unknown,
  pointer: PointerSegments
): Array<[unknown, PointerSegments]> {
  if (Array.isArray(value)) {
    return value.map((entry, i) => [entry, [...pointer, i]]);
  }
  return [[value, pointer]];
}

/**
 * A readable name for a pointer in `detail` text, e.g.
 * `['credentialStatus', 1, 'id']` → `credentialStatus[1].id`.
 */
export function displayPath(pointer: PointerSegments): string {
  return pointer
    .map((s, i) => (typeof s === 'number' ? `[${s}]` : i === 0 ? s : `.${s}`))
    .join('');
}

/**
 * Build a structural `ProblemDetail` whose `instance` is the JSON
 * Pointer for `pointer`.
 */
export function structureProblem(
  title: string,
  pointer: PointerSegments,
  detail: string
): ProblemDetail {
  return {
    type: ProblemTypes.PARSING_ERROR,
    title,
    detail,
    instance: formatJsonPointer(pointer)
  };
}

/**
 * The rule shared by every property whose entries must be objects
 * with a `type` (`proof`, `credentialStatus`, `termsOfUse`,
 * `evidence`, `credentialSchema`): report the entry itself when it is
 * not an object, or its `type` when only that is missing. Returns the
 * entry when it is an object, so callers can check further fields.
 */
export function checkTypedEntry(
  entry: unknown,
  pointer: PointerSegments,
  report: (pointer: PointerSegments, detail: string) => void
): Record<string, unknown> | undefined {
  const name = displayPath(pointer);
  if (!isPlainObject(entry)) {
    report(pointer, `"${name}" must be an object with a "type".`);
    return undefined;
  }
  if (stringValues(entry.type).length === 0) {
    report([...pointer, 'type'], `"${name}" must have a "type".`);
  }
  return entry;
}
