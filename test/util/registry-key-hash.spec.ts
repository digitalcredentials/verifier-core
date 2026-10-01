import { describe, it, expect } from 'vitest';
import { registryKeyHash } from '../../src/util/registry-key-hash.js';
import type { EntityIdentityRegistry } from '../../src/types/registry.js';

describe('registryKeyHash', () => {
  const dccLegacy: EntityIdentityRegistry = {
    name: 'Test Legacy',
    type: 'dcc-legacy',
    url: 'https://example.com/registry.json'
  };

  const oidf: EntityIdentityRegistry = {
    name: 'Test OIDF',
    type: 'oidf',
    trustAnchorEC: 'https://trust.example.com/.well-known/openid-federation'
  };

  const vcRecognition: EntityIdentityRegistry = {
    name: 'Test VC',
    type: 'vc-recognition',
    url: 'https://example.com/vc.json',
    acceptedIssuers: ['did:web:issuer.example.com']
  };

  it('produces same hash for same registries in same order', () => {
    const hash1 = registryKeyHash([dccLegacy, oidf]);
    const hash2 = registryKeyHash([dccLegacy, oidf]);
    expect(hash1).toBe(hash2);
  });

  it('produces same hash for same registries in different order', () => {
    const hash1 = registryKeyHash([dccLegacy, oidf, vcRecognition]);
    const hash2 = registryKeyHash([vcRecognition, dccLegacy, oidf]);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different registries', () => {
    const hash1 = registryKeyHash([dccLegacy]);
    const hash2 = registryKeyHash([oidf]);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for same type but different names', () => {
    const reg1: EntityIdentityRegistry = { ...dccLegacy, name: 'Legacy A' };
    const reg2: EntityIdentityRegistry = { ...dccLegacy, name: 'Legacy B' };
    const hash1 = registryKeyHash([reg1]);
    const hash2 = registryKeyHash([reg2]);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for same name but different URLs', () => {
    const reg1: EntityIdentityRegistry = { ...dccLegacy, url: 'https://a.com' };
    const reg2: EntityIdentityRegistry = { ...dccLegacy, url: 'https://b.com' };
    const hash1 = registryKeyHash([reg1]);
    const hash2 = registryKeyHash([reg2]);
    expect(hash1).not.toBe(hash2);
  });

  it('returns a string', () => {
    const hash = registryKeyHash([dccLegacy]);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles empty array', () => {
    const hash1 = registryKeyHash([]);
    const hash2 = registryKeyHash([]);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
  });
});
