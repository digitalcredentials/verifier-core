/**
 * RFC 6901 JSON Pointer formatting.
 *
 * Used by checks to populate {@link ProblemDetail.instance} so a
 * malformed sub-portion of a credential (e.g.,
 * `/credentialSubject/result/0/resultDescription`) can be
 * pinpointed without losing the rest of the problem context.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 */

/**
 * Format a sequence of JSON Pointer segments per RFC 6901.
 *
 * Escapes per RFC 6901 §4: `~` → `~0`, `/` → `~1`. Numeric
 * segments stringify as decimal. An empty segments array yields
 * the whole-document pointer `''` — checks should typically omit
 * `instance` entirely rather than emit `''` when a problem
 * applies to the whole credential.
 *
 * @example
 *   formatJsonPointer(['credentialSubject', 'result', 0, 'resultDescription'])
 *   // => '/credentialSubject/result/0/resultDescription'
 *   formatJsonPointer(['weird/key~with~chars'])
 *   // => '/weird~1key~0with~0chars'
 */
export function formatJsonPointer(segments: Array<string | number>): string {
  if (segments.length === 0) {
    return '';
  }
  return (
    '/' +
    segments
      .map(s => String(s).replaceAll('~', '~0').replaceAll('/', '~1'))
      .join('/')
  );
}
