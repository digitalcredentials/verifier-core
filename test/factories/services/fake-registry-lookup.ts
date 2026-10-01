import type {
  LookupIssuers,
  LookupIssuersOptions,
  RegistryLookupResult
} from '../../../src/types/registry.js';

export type FakeRegistryLookupOptions = {
  found?: boolean;
  matchingRegistries?: string[];
  uncheckedRegistries?: string[];
  error?: Error;
};

/**
 * Stub {@link LookupIssuers} with a fixed result or a thrown error.
 *
 * The returned function accepts options (fresh, exhaustive) but ignores them
 * — the stub result is always the same regardless of options.
 */
export function FakeRegistryLookup(
  options: FakeRegistryLookupOptions = {}
): LookupIssuers {
  const {
    found = true,
    matchingRegistries = found ? ['Test Registry'] : [],
    uncheckedRegistries = [],
    error
  } = options;

  return async (
    _did,
    _registries,
    _options?: LookupIssuersOptions
  ): Promise<RegistryLookupResult> => {
    if (error !== undefined) {
      throw error;
    }
    return {
      found,
      matchingRegistries,
      uncheckedRegistries
    };
  };
}
