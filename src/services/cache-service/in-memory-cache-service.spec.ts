import { describe, it, expect } from 'vitest';
import { InMemoryCacheService } from './in-memory-cache-service.js';

describe('InMemoryCacheService', () => {
  describe('basic get/set', () => {
    it('returns undefined for unknown keys', async () => {
      const cache = InMemoryCacheService();
      const result = await cache.get('nonexistent');
      expect(result).toBe(undefined);
    });

    it('round-trips a value', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value');
      const result = await cache.get('key');
      expect(result).toBe('value');
    });

    it('stores objects', async () => {
      const cache = InMemoryCacheService();
      const obj = { foo: 'bar', nested: { num: 42 } };
      await cache.set('key', obj);
      const result = await cache.get('key');
      expect(result).toEqual(obj);
    });

    it('overwrites existing keys', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'first');
      await cache.set('key', 'second');
      const result = await cache.get('key');
      expect(result).toBe('second');
    });
  });

  describe('TTL', () => {
    it('returns value before TTL expires', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value', 1000); // 1 second TTL
      const result = await cache.get('key');
      expect(result).toBe('value');
    });

    it('returns undefined after TTL expires', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value', 1); // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cache.get('key');
      expect(result).toBe(undefined);
    });

    it('deletes expired entry on access', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value', 1); // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // First access deletes
      await cache.get('key');

      // Second access still undefined
      const result = await cache.get('key');
      expect(result).toBe(undefined);
    });

    it('persists without TTL', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value'); // no TTL

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cache.get('key');
      expect(result).toBe('value');
    });

    it('handles TTL of 0 as no expiration', async () => {
      const cache = InMemoryCacheService();
      await cache.set('key', 'value', 0); // 0 TTL means no expiration

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await cache.get('key');
      expect(result).toBe('value');
    });
  });

  describe('isolation', () => {
    it('instances are isolated', async () => {
      const cache1 = InMemoryCacheService();
      const cache2 = InMemoryCacheService();

      await cache1.set('key', 'cache1-value');
      await cache2.set('key', 'cache2-value');

      const result1 = await cache1.get('key');
      const result2 = await cache2.get('key');

      expect(result1).toBe('cache1-value');
      expect(result2).toBe('cache2-value');
    });
  });
});
