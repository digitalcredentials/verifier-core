import { VerificationSuite } from '../../types/check.js';
import { recognitionProfileCheck } from './recognition-profile-check.js';

/**
 * Pluggable credential recognition suite.
 *
 * Runs by default in `defaultSuites` between `coreSuite` and
 * `proofSuite`. With no recognizers configured, the single
 * `recognition.profile` check emits `'skipped'`. With recognizers
 * registered via {@link VerifierConfig.recognizers}, the first
 * applies-true recognizer's normalized form is surfaced on
 * {@link CredentialVerificationResult.normalizedVerifiableCredential}.
 */
export const recognitionSuite: VerificationSuite = {
  id: 'recognition',
  name: 'Credential Recognition',
  description:
    'Pluggable credential recognition; produces normalized credential form for downstream consumption.',
  phase: 'recognition',
  checks: [recognitionProfileCheck]
};
