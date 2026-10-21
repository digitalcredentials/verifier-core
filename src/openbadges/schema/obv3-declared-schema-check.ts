import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { formatJsonPointer } from '../../util/json-pointer.js';
import { Obv3ProblemTypes } from '../problem-types.js';
import { KNOWN_OB_SCHEMA_URLS } from './known-schema-urls.js';
import {
  getObType,
  getVcVersion,
  vendoredSchemaFor,
  type VcVersion
} from './select-schema.js';

const VC_VERSION_LABEL: Record<VcVersion, string> = {
  v1: '1.1',
  v2: '2.0'
};

/** The declared schema ids, with the JSON Pointer of each entry. */
function declaredSchemaIds(
  credentialSchema: unknown
): Array<{ id: string; instance: string }> {
  const entries = Array.isArray(credentialSchema)
    ? credentialSchema.map((entry, i) => ({
        entry: entry as unknown,
        instance: formatJsonPointer(['credentialSchema', i])
      }))
    : [
        {
          entry: credentialSchema,
          instance: formatJsonPointer(['credentialSchema'])
        }
      ];

  // An entry without a string `id` is left to the core structure check.
  return entries.flatMap(({ entry, instance }) => {
    const id = (entry as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? [{ id, instance }] : [];
  });
}

/**
 * OBv3 declared-schema check.
 *
 * Compares an Open Badges credential's `credentialSchema` with the schema
 * the verifier validates it against (see `obv3SchemaCheck`), and reports
 * declarations that do not fit:
 *
 * - `OB_DECLARED_SCHEMA_MISMATCH` — a known Open Badges 3.0 schema URL for
 *   the other OB credential type, or one that does not accept the
 *   credential's VC version.
 * - `OB_DECLARED_SCHEMA_NOT_CHECKED` — any URL that is not a known Open
 *   Badges 3.0 schema, even alongside one that fits. It is not fetched.
 *
 * One problem per such entry, with `instance` pointing at it. Success when
 * every declared entry fits. Never fetches, and never changes which schema
 * the credential is validated against.
 *
 * Skipped when:
 * - Credential type doesn't include OpenBadgeCredential or EndorsementCredential
 * - Credential has neither the VC 1.1 nor the VC 2.0 context
 * - Credential declares no `credentialSchema`
 */
export const obv3DeclaredSchemaCheck: VerificationCheck = {
  id: 'schema.obv3.declared',
  name: 'OBv3 Declared Schema',
  description:
    "Reports a declared credentialSchema that does not fit the Open Badges credential's type and VC version.",
  fatal: false,
  appliesTo: ['verifiableCredential'],
  execute: async (subject: VerificationSubject): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;

    if (!credential) {
      return {
        status: 'skipped',
        reason: 'No verifiable credential found in subject.'
      };
    }

    const obType = getObType(credential);
    if (!obType) {
      return {
        status: 'skipped',
        reason:
          'Credential does not appear to be an OBv3 credential (OpenBadgeCredential or EndorsementCredential).'
      };
    }

    const vcVersion = getVcVersion(credential);
    if (!vcVersion) {
      return {
        status: 'skipped',
        reason:
          'Credential has neither the VC 1.1 nor the VC 2.0 context, so no Open Badges schema applies.'
      };
    }

    const declared = declaredSchemaIds(credential.credentialSchema);
    if (declared.length === 0) {
      return { status: 'skipped', reason: 'No credentialSchema declared.' };
    }

    const { specSection } = vendoredSchemaFor(obType, vcVersion);
    const problems: ProblemDetail[] = [];
    const fitting: string[] = [];

    for (const { id, instance } of declared) {
      const known = KNOWN_OB_SCHEMA_URLS.get(id);
      if (!known) {
        problems.push({
          type: Obv3ProblemTypes.OB_DECLARED_SCHEMA_NOT_CHECKED,
          title: 'Declared Schema Not Checked',
          detail: `credentialSchema declares ${id}, which is not a known Open Badges 3.0 schema. It was not fetched or checked; the credential was validated against ${specSection}.`,
          instance
        });
      } else if (
        known.obType !== obType ||
        !known.accepts.includes(vcVersion)
      ) {
        const accepts = known.accepts
          .map(v => VC_VERSION_LABEL[v])
          .join(' or ');
        problems.push({
          type: Obv3ProblemTypes.OB_DECLARED_SCHEMA_MISMATCH,
          title: 'Declared Schema Does Not Match Credential',
          detail: `credentialSchema declares ${id}, an Open Badges schema for ${known.obType} / VC ${accepts}, but this is an ${obType} using VC ${VC_VERSION_LABEL[vcVersion]}. It was validated against ${specSection} instead.`,
          instance
        });
      } else {
        fitting.push(id);
      }
    }

    if (problems.length > 0) {
      return { status: 'failure', problems };
    }
    return {
      status: 'success',
      message: `Declared credentialSchema fits this ${obType} using VC ${VC_VERSION_LABEL[vcVersion]}: ${fitting.join(', ')}.`
    };
  }
};
