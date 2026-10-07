import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  base64UrlToBytes,
  jwtDecodePayload
} from '../../../src/services/registry-handlers/jwt-payload-decode.js';

describe('jwtDecodePayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes a minimal JWT payload', () => {
    const payload = { sub: 'user', n: 1 };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url'
    );
    const jwt = `eyJhbGciOiJub25lIn0.${b64}.sig`;
    expect(jwtDecodePayload(jwt)).toEqual(payload);
  });

  it('decodes without Buffer, as in browsers and React Native', () => {
    const payload = { sub: 'did:web:example.org', name: 'Ünïcode' };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url'
    );
    vi.stubGlobal('Buffer', undefined);
    expect(jwtDecodePayload(`h.${b64}.s`)).toEqual(payload);
  });

  it('throws on malformed JWT', () => {
    expect(() => jwtDecodePayload('not-a-jwt')).toThrow(/Invalid JWT/);
  });
});

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url containing - and _', () => {
    // 0xfb 0xff 0xbf encodes as "+/+/" in base64 and "-_-_" in base64url.
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0xfe]);
    const encoded = Buffer.from(bytes).toString('base64url');
    expect(encoded).toMatch(/[-_]/);
    expect(encoded).not.toMatch(/=/);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });

  it('throws on input that is not base64url', () => {
    expect(() => base64UrlToBytes('a')).toThrow();
  });
});
