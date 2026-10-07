import { Ajv2019, type ValidateFunction } from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import { VerificationCheck, CheckOutcome } from '../../../types/check.js';
import { ProblemDetail } from '../../../types/problem-detail.js';
import { VerificationSubject } from '../../../types/subject.js';
import { FetchJson, VerificationContext } from '../../../types/context.js';
import { ProblemTypes } from '../../../problem-types.js';
import {
  isOpenBadgeCredential,
  isEndorsementCredential
} from '../../../openbadges/recognize.js';
import { createCachedSchemaLoader } from '../schema-loader.js';

// OBv3 schema URLs
const OBV3_SCHEMA_V1_ACHIEVEMENT =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json-ld/ob_v3p0_anyachievementcredential_schema.json';
const OBV3_SCHEMA_V1_ENDORSEMENT =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json-ld/ob_v3p0_anyendorsementcredential_schema.json';
const OBV3_SCHEMA_V2_ACHIEVEMENT =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json';
const OBV3_SCHEMA_V2_ENDORSEMENT =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorsementcredential_schema.json';

// VC context URLs
const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
const VC_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1';

/**
 * The published OBv3 schemas: the only URLs whose JSON is cached and whose
 * validators are kept for the life of a verifier. A credential can name any
 * `credentialSchema` URL, and keeping those would let an issuer grow both
 * caches without bound.
 */
const KNOWN_OBV3_SCHEMA_URLS: ReadonlySet<string> = new Set([
  OBV3_SCHEMA_V1_ACHIEVEMENT,
  OBV3_SCHEMA_V1_ENDORSEMENT,
  OBV3_SCHEMA_V2_ACHIEVEMENT,
  OBV3_SCHEMA_V2_ENDORSEMENT
]);

const isKnownObv3SchemaUrl = (url: string): boolean =>
  KNOWN_OBV3_SCHEMA_URLS.has(url);

/** One verifier's AJV instance and its compiled validators, by schema URL. */
interface SchemaValidatorCache {
  ajv: Ajv2019;
  validators: Map<string, Promise<ValidateFunction>>;
}

/**
 * Compiled validators, kept for the life of one verifier.
 *
 * Compiling is the expensive step, and a compiled validator is a function, so
 * it cannot go in a `CacheService`. It has to live in process memory, for
 * exactly as long as one verifier does.
 *
 * - Not module scope: this check is a singleton shared by every verifier, and
 *   AJV binds `loadSchema` when the instance is created. A module-level
 *   instance would fetch through the first verifier's HTTP service and URL
 *   policy for every later one, and share schemas between verifiers.
 * - Not on the context: `createVerifier` builds a fresh context for every
 *   call.
 * - Not keyed by `cacheService`: verifiers that share a cache would share an
 *   AJV bound to the first verifier's `fetchJson`.
 *
 * `createVerifier` builds one `fetchJson` per verifier, so its identity is the
 * verifier's lifetime, and the `WeakMap` lets the entry go with the verifier.
 * The AJV's loader binds the `cacheService` of the first context seen for that
 * `fetchJson`. Within `createVerifier` it is the same for every call.
 */
const validatorCaches = new WeakMap<FetchJson, SchemaValidatorCache>();

function newAjv(loadSchema: (url: string) => Promise<object>): Ajv2019 {
  const ajv = new Ajv2019({ allErrors: true, loadSchema });
  addFormats.default(ajv);
  return ajv;
}

async function compile(
  ajv: Ajv2019,
  schemaUrl: string
): Promise<ValidateFunction> {
  return (
    ajv.getSchema(schemaUrl) || (await ajv.compileAsync({ $ref: schemaUrl }))
  );
}

/**
 * Resolve the validator for `schemaUrl`.
 *
 * A known OBv3 schema is compiled once per verifier, and its JSON comes from
 * `cacheService` when present. Any other URL gets a fresh AJV for this call
 * and nothing is kept, as before. A known schema reached through a `$ref`
 * still comes from the cache, because the loader decides per URL.
 *
 * The compile promise is memoised, so concurrent first verifications share
 * one compile. A rejected compile is dropped so that the next call retries.
 */
function resolveValidator(
  context: VerificationContext,
  schemaUrl: string
): Promise<ValidateFunction> {
  const loadSchema = createCachedSchemaLoader(
    context.fetchJson,
    context.cacheService,
    isKnownObv3SchemaUrl
  );

  if (!isKnownObv3SchemaUrl(schemaUrl)) {
    return compile(newAjv(loadSchema), schemaUrl);
  }

  let cache = validatorCaches.get(context.fetchJson);
  if (!cache) {
    cache = { ajv: newAjv(loadSchema), validators: new Map() };
    validatorCaches.set(context.fetchJson, cache);
  }

  const existing = cache.validators.get(schemaUrl);
  if (existing) {
    return existing;
  }

  const { validators } = cache;
  const pending = compile(cache.ajv, schemaUrl);
  validators.set(schemaUrl, pending);
  pending.catch(() => {
    if (validators.get(schemaUrl) === pending) {
      validators.delete(schemaUrl);
    }
  });
  return pending;
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
 * Determine VC version from contexts.
 */
function getVcVersion(credential: Record<string, unknown>): 'v1' | 'v2' | null {
  const contexts = credential['@context'];
  // String or array: the credential arrives as issued, not Zod-normalized
  // (see the invariant in `verifier.ts`).
  const list = Array.isArray(contexts) ? contexts : [contexts];

  const stringContexts = list.filter(
    (ctx): ctx is string => typeof ctx === 'string'
  );

  if (stringContexts.some(ctx => ctx.startsWith(VC_V2_CONTEXT))) {
    return 'v2';
  }
  if (stringContexts.some(ctx => ctx.startsWith(VC_V1_CONTEXT))) {
    return 'v1';
  }
  return null;
}

/**
 * Select the appropriate OBv3 schema URL.
 */
function selectObv3Schema(
  credential: Record<string, unknown>
): { schema: string | null; obType: string; source: string } | null {
  const credentialSchema = credential.credentialSchema as
    | Array<{ id: string }>
    | { id: string }
    | undefined;

  // If credentialSchema is specified, use those URLs directly
  if (credentialSchema) {
    const schemas = Array.isArray(credentialSchema)
      ? credentialSchema
      : [credentialSchema];
    if (schemas.length > 0 && schemas[0]?.id) {
      return {
        schema: schemas[0].id,
        obType: '',
        source: 'Schema was listed in the credentialSchema property of the VC'
      };
    }
  }
  // fall through - no valid credentialSchema found

  const vcVersion = getVcVersion(credential);
  if (!vcVersion) {
    return null;
  }

  let schema: string | null = null;
  let obType = '';

  if (isOpenBadgeCredential(credential)) {
    obType = 'OpenBadgeCredential';
    schema =
      vcVersion === 'v1'
        ? OBV3_SCHEMA_V1_ACHIEVEMENT
        : OBV3_SCHEMA_V2_ACHIEVEMENT;
  } else if (isEndorsementCredential(credential)) {
    obType = 'EndorsementCredential';
    schema =
      vcVersion === 'v1'
        ? OBV3_SCHEMA_V1_ENDORSEMENT
        : OBV3_SCHEMA_V2_ENDORSEMENT;
  }

  if (!schema) {
    return null;
  }

  return {
    schema,
    obType,
    source: `Assumed based on vc.type: '${obType}' and vc version: '${vcVersion}'`
  };
}

/**
 * OBv3 schema validation check.
 *
 * Validates OpenBadgeCredential and EndorsementCredential against
 * the appropriate OBv3 JSON Schema.
 *
 * Skipped when:
 * - Credential type doesn't include OpenBadgeCredential or EndorsementCredential
 * - Credential doesn't have OBv3 context
 */
export const obv3SchemaCheck: VerificationCheck = {
  id: 'schema.obv3.json',
  name: 'OBv3 JSON Schema Validation',
  description: 'Validates OBv3 credentials against published JSON Schema.',
  fatal: false,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;

    if (!credential) {
      return {
        status: 'skipped',
        reason: 'No verifiable credential found in subject.'
      };
    }

    // Check if this is an OBv3 credential
    const schemaInfo = selectObv3Schema(credential);

    if (!schemaInfo?.schema) {
      return {
        status: 'skipped',
        reason:
          'Credential does not appear to be an OBv3 credential (OpenBadgeCredential or EndorsementCredential).'
      };
    }

    try {
      const validate = await resolveValidator(context, schemaInfo.schema);
      const result = validateAgainstSchema(validate, credential);

      if (result.valid) {
        return {
          status: 'success',
          message: `OBv3 schema validation passed. Schema: ${schemaInfo.schema}. Source: ${schemaInfo.source}`
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
          detail: `Schema validation failed for ${schemaInfo.schema}: ${errorDetails}`
        }
      ];

      return {
        status: 'failure',
        problems
      };
    } catch (error) {
      // Error during validation (e.g., couldn't fetch schema)
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
