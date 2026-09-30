import { VerificationSuite } from '../../types/check.js';
import { contextCheck } from './context-check.js';
import { vcContextCheck } from './vc-context-check.js';
import { vcStructureCheck } from './vc-structure-check.js';
import { vpStructureCheck } from './vp-structure-check.js';
import { credentialIdCheck } from './credential-id-check.js';
import { proofExistsCheck } from './proof-exists-check.js';

/**
 * Core structure verification suite.
 *
 * Validates basic credential structure before cryptographic verification:
 * 1. Context exists and is non-empty
 * 2. Context includes valid VC context URI
 * 3. Credential meets the VC Data Model's structural requirements
 *    (`core.vc-structure`)
 * 4. Presentation meets the VC Data Model's structural requirements
 *    (`core.vp-structure`; the only check that runs for a presentation)
 * 5. Credential ID is valid URL (if present)
 * 6. Proof exists on the credential
 *
 * All checks are fatal - a failure stops all remaining checks for this subject.
 */
export const coreSuite: VerificationSuite = {
  id: 'core',
  name: 'Core Structure',
  description:
    'Validates basic credential structure before cryptographic verification.',
  phase: 'cryptographic',
  checks: [
    contextCheck,
    vcContextCheck,
    vcStructureCheck,
    vpStructureCheck,
    credentialIdCheck,
    proofExistsCheck
  ]
};
