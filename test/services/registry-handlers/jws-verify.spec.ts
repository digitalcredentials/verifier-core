import { beforeAll, describe, expect, it } from 'vitest';
import { verifyJws } from '../../../src/services/registry-handlers/jws-verify.js';
import {
  generateSigningKey,
  jwkSet,
  signJws,
  type TestSigningKey
} from '../../factories/oidf/sign-entity-statement.js';

const payload = { iss: 'https://ta.example', sub: 'did:key:abc', n: 1 };

/** Replace one segment of a compact JWS. */
function withSegment(jws: string, index: number, segment: string): string {
  const parts = jws.split('.');
  parts[index] = segment;
  return parts.join('.');
}

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('verifyJws', () => {
  let es256: TestSigningKey;
  let eddsa: TestSigningKey;
  let otherEs256: TestSigningKey;

  beforeAll(async () => {
    es256 = await generateSigningKey('ES256');
    eddsa = await generateSigningKey('EdDSA');
    otherEs256 = await generateSigningKey('ES256', 'other-key');
  });

  it('verifies an ES256 JWS', async () => {
    const jws = await signJws({ key: es256, payload });
    expect(await verifyJws(jws, jwkSet(es256))).toEqual({
      valid: true,
      payload
    });
  });

  it('verifies an EdDSA JWS', async () => {
    const jws = await signJws({ key: eddsa, payload });
    expect(await verifyJws(jws, jwkSet(eddsa))).toEqual({
      valid: true,
      payload
    });
  });

  it('rejects a tampered payload', async () => {
    const jws = await signJws({ key: es256, payload });
    const tampered = withSegment(jws, 1, encode({ ...payload, n: 2 }));
    expect(await verifyJws(tampered, jwkSet(es256))).toEqual({
      valid: false,
      reason: 'signature did not verify'
    });
  });

  it('rejects a tampered signature', async () => {
    const jws = await signJws({ key: eddsa, payload });
    const other = await signJws({ key: eddsa, payload: { other: true } });
    const tampered = withSegment(jws, 2, other.split('.')[2]);
    expect(await verifyJws(tampered, jwkSet(eddsa))).toEqual({
      valid: false,
      reason: 'signature did not verify'
    });
  });

  it('rejects a JWS signed by a key outside the set', async () => {
    const jws = await signJws({ key: otherEs256, payload });
    expect(await verifyJws(jws, jwkSet(es256))).toEqual({
      valid: false,
      reason: 'signature did not verify'
    });
  });

  it('tries every key when the header kid matches none', async () => {
    const jws = await signJws({
      key: eddsa,
      payload,
      header: { kid: 'sandbox-ta-1' }
    });
    expect(await verifyJws(jws, jwkSet(eddsa))).toEqual({
      valid: true,
      payload
    });
  });

  it('finds the matching key among several', async () => {
    const jws = await signJws({ key: es256, payload });
    const result = await verifyJws(jws, jwkSet(otherEs256, eddsa, es256));
    expect(result.valid).toBe(true);
  });

  it('rejects RS256 as an unsupported alg', async () => {
    const jws = await signJws({
      key: es256,
      payload,
      header: { alg: 'RS256' }
    });
    expect(await verifyJws(jws, jwkSet(es256))).toEqual({
      valid: false,
      reason: 'unsupported alg'
    });
  });

  it('rejects alg none', async () => {
    const unsigned = `${encode({ alg: 'none' })}.${encode(payload)}.c2ln`;
    expect(await verifyJws(unsigned, jwkSet(es256))).toEqual({
      valid: false,
      reason: 'unsupported alg'
    });
  });

  it('rejects a JWS with two segments', async () => {
    const jws = await signJws({ key: es256, payload });
    const [header, body] = jws.split('.');
    expect(await verifyJws(`${header}.${body}`, jwkSet(es256))).toEqual({
      valid: false,
      reason: 'malformed JWS'
    });
  });

  it('rejects an empty signature segment', async () => {
    const jws = await signJws({ key: es256, payload });
    expect(await verifyJws(withSegment(jws, 2, ''), jwkSet(es256))).toEqual({
      valid: false,
      reason: 'malformed JWS'
    });
  });

  it('rejects a header that is not JSON', async () => {
    const jws = await signJws({ key: es256, payload });
    expect(
      await verifyJws(withSegment(jws, 0, 'bm90LWpzb24'), jwkSet(es256))
    ).toEqual({ valid: false, reason: 'malformed JWS' });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'keys'],
    ['keys not an array', { keys: {} }]
  ])('rejects a JWK Set that is %s', async (_label, jwks) => {
    const jws = await signJws({ key: es256, payload });
    expect(await verifyJws(jws, jwks)).toEqual({
      valid: false,
      reason: 'no JWK Set'
    });
  });

  it('skips a key whose kty does not fit the alg', async () => {
    const jws = await signJws({ key: es256, payload });
    // Same kid, but an OKP key cannot verify ES256, so it is never tried.
    const mislabelled = { ...eddsa.jwk, kid: es256.kid };
    expect(await verifyJws(jws, { keys: [mislabelled] })).toEqual({
      valid: false,
      reason: 'signature did not verify'
    });
    expect(
      (await verifyJws(jws, { keys: [mislabelled, es256.jwk] })).valid
    ).toBe(true);
  });

  it('skips a key the library cannot import', async () => {
    const jws = await signJws({ key: es256, payload });
    const broken = {
      kty: 'EC',
      crv: 'P-256',
      kid: es256.kid,
      x: 'AA',
      y: 'AA'
    };
    expect((await verifyJws(jws, { keys: [broken, es256.jwk] })).valid).toBe(
      true
    );
  });
});
