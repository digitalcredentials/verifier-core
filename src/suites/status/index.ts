import { VerificationSuite } from '../../types/check.js';
import { bitstringStatusCheck } from './bitstring-status-check.js';

/**
 * Credential status verification suite.
 *
 * Sole owner of status verification (post-P-E, 2026-04-19). Checks
 * revocation and suspension status via BitstringStatusList. The
 * underlying check is **fatal** — see {@link bitstringStatusCheck}
 * for the contract.
 *
 * Skipped when:
 * - Credential has no `credentialStatus`.
 * - Status type is a legacy type (`StatusList2021Entry`,
 *   `1EdTechRevocationList`).
 */
export const statusSuite: VerificationSuite = {
  id: 'status',
  name: 'Credential Status',
  description:
    'Checks revocation and suspension status via BitstringStatusList.',
  phase: 'cryptographic',
  checks: [bitstringStatusCheck]
};
