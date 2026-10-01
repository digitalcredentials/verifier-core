import type { EntityIdentityRegistry } from '../types/registry.js';

/**
 * Compute a stable hash of registries for cache key generation.
 *
 * The hash is deterministic regardless of registry order.
 * Uses a simple non-cryptographic hash (djb2) for speed.
 */
export function registryKeyHash(registries: EntityIdentityRegistry[]): string {
  // Extract stable identifiers from each registry
  const ids = registries.map(registry => {
    switch (registry.type) {
      case 'dcc-legacy':
        return `dcc-legacy:${registry.name}:${registry.url}`;
      case 'oidf':
        return `oidf:${registry.name}:${registry.trustAnchorEC}`;
      case 'vc-recognition':
        return `vc-recognition:${registry.name}:${registry.url}`;
      default:
        // This default case handles any future registry types
        // The switch is exhaustive for the current union type
        return `unknown:${(registry as { name?: string }).name ?? 'unnamed'}`;
    }
  });

  // Sort for determinism
  ids.sort();

  // Join and hash
  const combined = ids.join('|');
  return djb2Hash(combined);
}

/**
 * djb2 non-cryptographic hash algorithm.
 * Fast and produces good distribution for cache keys.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0; // Force unsigned 32-bit
  }
  return hash.toString(16); // Hex representation
}
