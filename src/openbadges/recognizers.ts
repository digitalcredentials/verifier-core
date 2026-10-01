/**
 * Open Badges 3.0 recognizers.
 *
 * Pluggable {@link RecognizerSpec}s for the built-in
 * `recognitionSuite`. Wire them by passing them to
 * `createVerifier({ recognizers: [obv3p0Recognizer, obv3p0EndorsementRecognizer] })`.
 *
 * - `obv3p0Recognizer` recognizes an OB 3.0
 *   OpenBadgeCredential / AchievementCredential
 *   (`isOpenBadgeCredential`) and parses via
 *   {@link parseObv3p0OpenBadgeCredential}.
 * - `obv3p0EndorsementRecognizer` recognizes an OB 3.0
 *   EndorsementCredential (`isEndorsementCredential`) and parses
 *   via {@link parseObv3p0EndorsementCredential}.
 *
 * The two recognizers' `applies` predicates are mutually
 * exclusive (an EndorsementCredential isn't an OpenBadgeCredential
 * and vice versa), so configuration order doesn't affect which one
 * fires for a given credential.
 *
 * @see `docs/plans/2026-04-18-openbadges-recognizer-and-subchecks/00-design.md`
 */

import type { RecognizerSpec } from '../types/recognition.js';
import { isEndorsementCredential, isOpenBadgeCredential } from './recognize.js';
import { parseObv3p0OpenBadgeCredential } from './schemas/openbadge-credential-v3p0.js';
import { parseObv3p0EndorsementCredential } from './schemas/endorsement-credential-v3p0.js';

export const obv3p0Recognizer: RecognizerSpec = {
  id: 'obv3p0.openbadge',
  name: 'Open Badges 3.0',
  applies: subject => isOpenBadgeCredential(subject),
  parse: parseObv3p0OpenBadgeCredential
};

export const obv3p0EndorsementRecognizer: RecognizerSpec = {
  id: 'obv3p0.endorsement',
  name: 'Open Badges 3.0 Endorsement',
  applies: subject => isEndorsementCredential(subject),
  parse: parseObv3p0EndorsementCredential
};
