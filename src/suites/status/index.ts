import { VerificationSuite } from '../../types/check.js';
import { bitstringStatusCheck } from './bitstring-status-check.js';
import { statusListIssuerCheck } from './list-issuer-check.js';

/**
 * Credential status verification suite.
 *
 * Sole owner of status verification. Checks revocation and suspension
 * status via BitstringStatusList with the **fatal**
 * {@link bitstringStatusCheck}, then reports a status list not issued by
 * the credential's issuer with the non-fatal {@link statusListIssuerCheck}.
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
  checks: [bitstringStatusCheck, statusListIssuerCheck]
};
