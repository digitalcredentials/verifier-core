import { VerificationSuite } from '../../../types/check.js';
import { obv3SchemaCheck } from './obv3-schema-check.js';

/**
 * OBv3 JSON Schema verification suite.
 *
 * AJV-driven JSON Schema validation against published OBv3 schemas
 * for OpenBadgeCredential and EndorsementCredential. Network-bound
 * (must fetch the schema document) and therefore opt-in — see the
 * OpenBadges submodule for a curated bundle that combines this suite
 * with the lightweight semantic checks.
 *
 * Non-fatal — schema validation failures do not invalidate the
 * credential's signature or status.
 */
export const obv3SchemaSuite: VerificationSuite = {
  id: 'schema.obv3',
  name: 'OBv3 Schema',
  description:
    'JSON Schema validation for OpenBadgeCredential / EndorsementCredential.',
  checks: [obv3SchemaCheck]
};
