/**
 * Every URL an issuer might put in `credentialSchema` to name an Open Badges
 * 3.0 credential schema, and which credentials each one fits.
 *
 * Used only to report on a declared `credentialSchema`: none of these is
 * fetched, and none chooses the schema a credential is validated against.
 *
 * - The eight purl-published schemas. `json/` and `json-ld/` hold the same
 *   schemas. The strict ones accept VC 2.0 only; the "Any" ones accept VC 1.1
 *   or VC 2.0.
 * - The four `$id`s of the schemas embedded in the spec, which do not
 *   resolve but can be copied from the spec. Each accepts one VC version.
 */

import type { ObType, VcVersion } from './select-schema.js';

export interface KnownObSchemaUrl {
  /** The Open Badges credential type the schema validates. */
  obType: ObType;
  /** The VC data model versions the schema accepts. */
  accepts: ReadonlyArray<VcVersion>;
}

const P = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/';

const OB: ObType = 'OpenBadgeCredential';
const ENDORSEMENT: ObType = 'EndorsementCredential';

export const KNOWN_OB_SCHEMA_URLS: ReadonlyMap<string, KnownObSchemaUrl> =
  new Map<string, KnownObSchemaUrl>([
    // purl-published, draft 2019-09
    ...['json/', 'json-ld/'].flatMap(
      dir =>
        [
          [
            `${P}${dir}ob_v3p0_achievementcredential_schema.json`,
            { obType: OB, accepts: ['v2'] }
          ],
          [
            `${P}${dir}ob_v3p0_anyachievementcredential_schema.json`,
            { obType: OB, accepts: ['v1', 'v2'] }
          ],
          [
            `${P}${dir}ob_v3p0_endorsementcredential_schema.json`,
            { obType: ENDORSEMENT, accepts: ['v2'] }
          ],
          [
            `${P}${dir}ob_v3p0_anyendorsementcredential_schema.json`,
            { obType: ENDORSEMENT, accepts: ['v1', 'v2'] }
          ]
        ] as const
    ),
    // embedded in the spec, draft 2020-12; the vendored schemas' `$id`s
    [
      `${P}json/ob_v3p0_achievementcredential-jsonschema1.json`,
      { obType: OB, accepts: ['v2'] }
    ],
    [
      `${P}json/ob_v3p0_achievementcredentialv1p1-jsonschema1.json`,
      { obType: OB, accepts: ['v1'] }
    ],
    [
      `${P}json/ob_v3p0_endorsementcredential-jsonschema1.json`,
      { obType: ENDORSEMENT, accepts: ['v2'] }
    ],
    [
      `${P}json/ob_v3p0_endorsementcredentialv1p1-jsonschema1.json`,
      { obType: ENDORSEMENT, accepts: ['v1'] }
    ]
  ]);
