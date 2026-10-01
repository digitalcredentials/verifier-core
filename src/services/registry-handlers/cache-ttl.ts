/** Default TTL when no Cache-Control or credential validity applies (1 hour). */
export const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Extract `max-age` (seconds) from response headers and convert to milliseconds.
 */
export const parseCacheControlMaxAge = (
  headers: Headers
): number | undefined => {
  const raw = headers.get('cache-control');
  if (!raw) {
    return undefined;
  }
  const match = /\bmax-age\s*=\s*(\d+)\b/i.exec(raw);
  if (!match) {
    return undefined;
  }
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds * 1000;
};

/**
 * Milliseconds from now until `validUntil` (ISO 8601). Undefined if invalid or already past.
 */
export const ttlFromValidUntil = (validUntil: string): number | undefined => {
  const end = Date.parse(validUntil);
  if (!Number.isFinite(end)) {
    return undefined;
  }
  const delta = end - Date.now();
  if (delta <= 0) {
    return undefined;
  }
  return delta;
};

/**
 * First defined positive TTL among sources, otherwise {@link DEFAULT_TTL_MS}.
 */
export const resolveTtl = (...sources: Array<number | undefined>): number => {
  for (const ms of sources) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
      return ms;
    }
  }
  return DEFAULT_TTL_MS;
};
