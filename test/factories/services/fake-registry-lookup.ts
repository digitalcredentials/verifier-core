import type {
  LookupIssuers,
  LookupIssuersOptions,
  RegistryLookupResult,
  RegistryMatch,
  RegistryReference
} from '../../../src/types/registry.js';

/** A registry named by name alone, or spelled out in full. */
export type FakeRegistryRef = string | RegistryReference;

export type FakeRegistryLookupOptions = {
  found?: boolean;
  /** Registries that matched, as bare names or full references. */
  matchingRegistries?: FakeRegistryRef[];
  /** Matches with entity data; overrides `matchingRegistries` when given. */
  matches?: RegistryMatch[];
  uncheckedRegistries?: FakeRegistryRef[];
  error?: Error;
};

function toReference(ref: FakeRegistryRef): RegistryReference {
  return typeof ref === 'string'
    ? { name: ref, type: 'dcc-legacy', url: `https://factory.test/${ref}.json` }
    : ref;
}

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

  const matches: RegistryMatch[] =
    options.matches ??
    matchingRegistries.map(ref => ({ registry: toReference(ref) }));

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
      matches,
      uncheckedRegistries: uncheckedRegistries.map(toReference)
    };
  };
}
