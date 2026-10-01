import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TTL_MS,
  parseCacheControlMaxAge,
  resolveTtl,
  ttlFromValidUntil
} from '../../../src/services/registry-handlers/cache-ttl.js';

describe('parseCacheControlMaxAge', () => {
  it('returns undefined when header missing', () => {
    expect(parseCacheControlMaxAge(new Headers())).toBeUndefined();
  });

  it('parses max-age in seconds to ms', () => {
    const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
    expect(parseCacheControlMaxAge(headers)).toBe(3600 * 1000);
  });

  it('is case insensitive', () => {
    const headers = new Headers({ 'cache-control': 'Max-Age=60' });
    expect(parseCacheControlMaxAge(headers)).toBe(60 * 1000);
  });

  it('returns undefined for invalid max-age', () => {
    const headers = new Headers({ 'cache-control': 'max-age=abc' });
    expect(parseCacheControlMaxAge(headers)).toBeUndefined();
  });
});

describe('ttlFromValidUntil', () => {
  it('returns ms until future instant', () => {
    const future = new Date(Date.now() + 5000).toISOString();
    const ttl = ttlFromValidUntil(future);
    expect(ttl).toBeGreaterThan(4000);
    expect(ttl).toBeLessThanOrEqual(5000);
  });

  it('returns undefined for past instant', () => {
    expect(ttlFromValidUntil('2000-01-01T00:00:00Z')).toBeUndefined();
  });

  it('returns undefined for invalid string', () => {
    expect(ttlFromValidUntil('not-a-date')).toBeUndefined();
  });
});

describe('resolveTtl', () => {
  it('uses first positive finite value', () => {
    expect(resolveTtl(undefined, 100, 200)).toBe(100);
  });

  it('skips non-positive values', () => {
    expect(resolveTtl(0, -1, 500)).toBe(500);
  });

  it('falls back to DEFAULT_TTL_MS', () => {
    expect(resolveTtl(undefined, undefined)).toBe(DEFAULT_TTL_MS);
  });
});
