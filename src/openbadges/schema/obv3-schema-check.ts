import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { ProblemTypes } from '../../problem-types.js';
import type { VendoredObSchema } from './json-schema/index.js';
import { getObType, getVcVersion, vendoredSchemaFor } from './select-schema.js';

/**
 * One AJV instance and its compiled validators, by schema `$id`, for the life
 * of the process.
 *
 * Compiling is the expensive step, so each schema is compiled once, on first
 * use. Module scope is safe because nothing is fetched: the schemas are
 * vendored, so no loader binds one verifier's HTTP service or URL policy, and
 * every verifier would compile the same four schemas to the same validators.
 *
 * `strictTuples: false`: the spec schemas use `prefixItems` without
 * `minItems`/`maxItems`, which AJV's strict mode reports on the console.
 */
let ajv: Ajv2020 | undefined;
const validators = new Map<string, ValidateFunction>();

function validatorFor(vendored: VendoredObSchema): ValidateFunction {
  const existing = validators.get(vendored.id);
  if (existing) {
    return existing;
  }
  if (!ajv) {
    ajv = new Ajv2020({ allErrors: true, strictTuples: false });
    addFormats.default(ajv);
  }
  const validate = ajv.compile(vendored.schema);
  validators.set(vendored.id, validate);
  return validate;
}

/**
 * Validate a credential with a compiled validator.
 *
 * `validate.errors` is read straight after the call: a shared validator's
 * `errors` is overwritten by the next call, so nothing may await in between.
 */
function validateAgainstSchema(
  validate: ValidateFunction,
  credential: Record<string, unknown>
): {
  valid: boolean;
  errors?: Array<{ message: string; instancePath: string }>;
} {
  const valid = validate(credential) as boolean;
  const errors = validate.errors?.map(e => ({
    message: e.message || 'Validation error',
    instancePath: e.instancePath || ''
  }));
  return { valid, errors };
}

/**
 * OBv3 schema validation check.
 *
 * Validates OpenBadgeCredential and EndorsementCredential against the JSON
 * Schema the Open Badges 3.0 spec gives for the credential's type and VC
 * version, from copies bundled with this package:
 *
 * | Credential | Schema |
 * |---|---|
 * | `OpenBadgeCredential`, VC 2.0 | E.2.1.2 AchievementCredential |
 * | `OpenBadgeCredential`, VC 1.1 | E.2.1.34 AchievementCredentialv1p1 |
 * | `EndorsementCredential`, VC 2.0 | E.2.1.7 EndorsementCredential |
 * | `EndorsementCredential`, VC 1.1 | E.2.1.36 EndorsementCredentialv1p1 |
 *
 * Never fetches. The credential's `credentialSchema` does not choose the
 * schema.
 *
 * Skipped when:
 * - Credential type doesn't include OpenBadgeCredential or EndorsementCredential
 * - Credential doesn't have OBv3 context
 * - Credential has neither the VC 1.1 nor the VC 2.0 context
 */
export const obv3SchemaCheck: VerificationCheck = {
  id: 'schema.obv3.json',
  name: 'OBv3 JSON Schema Validation',
  description:
    'Validates OBv3 credentials against the bundled Open Badges 3.0 JSON Schema for their type and VC version.',
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

    const vendored = vendoredSchemaFor(obType, vcVersion);

    try {
      const result = validateAgainstSchema(validatorFor(vendored), credential);

      if (result.valid) {
        return {
          status: 'success',
          message: `OBv3 schema validation passed against ${vendored.specSection} (${vendored.id}).`
        };
      }

      // Validation failed - format AJV errors
      const errorDetails =
        result.errors
          ?.map(e =>
            e.instancePath ? `${e.instancePath}: ${e.message}` : e.message
          )
          .join('; ') || 'Unknown validation error';

      const problems: ProblemDetail[] = [
        {
          type: ProblemTypes.SCHEMA_VALIDATION_FAILED,
          title: 'Schema Validation Failed',
          detail: `Schema validation failed against ${vendored.specSection}: ${errorDetails}`
        }
      ];

      return {
        status: 'failure',
        problems
      };
    } catch (error) {
      // Error compiling or running the validator
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.SCHEMA_VALIDATION_ERROR,
            title: 'Schema Validation Error',
            detail:
              error instanceof Error
                ? error.message
                : 'An error occurred during schema validation.'
          }
        ]
      };
    }
  }
};
