/**
 * Interoperability smoke tests: real {@link DataIntegrityCryptoService} and
 * default document loader (network for contexts, DIDs, and hosted status lists).
 *
 * Run with `npm run test:smoke` — excluded from the default offline test run.
 */

import { describe, it, expect } from 'vitest';
import { verifyCredential } from '../src/index.js';
import { v1NoStatus } from './fixtures/v1-no-status.js';
import { v2NoStatus } from './fixtures/v2-no-status.js';
import { v2WithValidStatus } from './fixtures/v2-with-valid-status.js';
import { v2EddsaWithValidStatus } from './fixtures/v2-eddsa-with-valid-status.js';
import { v2EcdsaNoStatus } from './fixtures/v2-ecdsa-no-status.js';
import { v2didWebWithValidStatus } from './fixtures/v2-did-web-with-valid-status.js';
import { v2DoubleSigWithValidStatus } from './fixtures/v2-double-sig-with-valid-status.js';

describe('smoke (golden credentials, real crypto + loader)', () => {
  it('v1NoStatus — VC 1.1 / Ed25519-2020 / did:key', async () => {
    const result = await verifyCredential({ credential: v1NoStatus });
    expect(result.verified).toBe(true);
  });

  it('v2NoStatus — VC 2.0 / Ed25519-2020 / did:key', async () => {
    const result = await verifyCredential({ credential: v2NoStatus });
    expect(result.verified).toBe(true);
  });

  it('v2WithValidStatus — BitstringStatusList valid', async () => {
    const result = await verifyCredential({ credential: v2WithValidStatus });
    expect(result.verified).toBe(true);
  });

  it('v2EddsaWithValidStatus — EdDSA RDFC-2022 Data Integrity', async () => {
    const result = await verifyCredential({
      credential: v2EddsaWithValidStatus
    });
    expect(result.verified).toBe(true);
  });

  it('v2EcdsaNoStatus — ECDSA RDFC-2019 Data Integrity / P-256 did:key', async () => {
    const result = await verifyCredential({ credential: v2EcdsaNoStatus });
    expect(result.verified).toBe(true);
  });

  it('v2didWebWithValidStatus — did:web issuer', async () => {
    const result = await verifyCredential({
      credential: v2didWebWithValidStatus
    });
    expect(result.verified).toBe(true);
  });

  it('v2DoubleSigWithValidStatus — dual Ed25519 + EdDSA proofs', async () => {
    const result = await verifyCredential({
      credential: v2DoubleSigWithValidStatus
    });
    expect(result.verified).toBe(true);
  });

  it('detects tampering on a golden credential (real signature check)', async () => {
    const tampered = JSON.parse(JSON.stringify(v1NoStatus)) as Record<
      string,
      unknown
    >;
    const cs = { ...(tampered.credentialSubject as Record<string, unknown>) };
    cs.name = 'Tampered Name';
    tampered.credentialSubject = cs;
    const result = await verifyCredential({ credential: tampered });
    expect(result.verified).toBe(false);
    const sigCheck = result.results.find(r => r.check === 'proof.signature');
    expect(sigCheck?.outcome.status).toBe('failure');
  });
});
