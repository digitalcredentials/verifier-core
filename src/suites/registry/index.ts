import { VerificationSuite } from '../../types/check.js';
import { issuerRegistryCheck } from './issuer-registry-check.js';

/**
 * Issuer registry verification suite.
 *
 * Checks if the credential's issuer DID appears in known DID registries.
 * This suite is non-fatal - registry check failures don't invalidate the credential,
 * they only provide information about whether the issuer is recognized.
 *
 * Skipped when:
 * - No registries are configured in the verification context
 */
export const registrySuite: VerificationSuite = {
  id: 'registry',
  name: 'Issuer Registry',
  description: 'Checks if the issuer DID appears in known DID registries.',
  phase: 'trust',
  checks: [issuerRegistryCheck]
};
