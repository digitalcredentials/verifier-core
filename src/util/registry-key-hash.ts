import type { EntityIdentityRegistry } from '../types/registry.js';

/**
 * Stable cache key for a list of registries: the sorted registry ids
 * themselves rather than a hash of them, so two different registry lists
 * can never share a key, even across tenants sharing a cache.
 *
 * The key is deterministic regardless of registry order. Each id and the
 * list are JSON-encoded, so no registry name or URL can contain a
 * separator that makes one list's key read as another's.
 */
export function registryKeyHash(registries: EntityIdentityRegistry[]): string {
  // Extract stable identifiers from each registry
  const ids = registries.map(registry => {
    switch (registry.type) {
      case 'dcc-legacy':
        return JSON.stringify(['dcc-legacy', registry.name, registry.url]);
      case 'oidf':
        return JSON.stringify(['oidf', registry.name, registry.trustAnchorEC]);
      case 'vc-recognition':
        return JSON.stringify(['vc-recognition', registry.name, registry.url]);
      default:
        // This default case handles any future registry types
        // The switch is exhaustive for the current union type
        return JSON.stringify([
          'unknown',
          (registry as { name?: string }).name ?? 'unnamed'
        ]);
    }
  });

  // Sort for determinism
  ids.sort();

  return JSON.stringify(ids);
}
