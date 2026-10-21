import { describe, it, expect, vi, afterEach } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { runSuites } from '../../../src/run-suites.js';
import { obv3SchemaCheck } from '../../../src/openbadges/schema/obv3-schema-check.js';
import type { VerificationSuite } from '../../../src/types/check.js';
import type { CheckOutcome } from '../../../src/types/check.js';
import type { VerificationContext } from '../../../src/types/context.js';
import { buildTestContext } from '../../factories/services/build-test-context.js';
import { FakeHttpGetService } from '../../factories/services/fake-http-get-service.js';
import { CredentialFactory } from '../../factories/data/credential-factory.js';
import { sampleAchievementCredential } from '../fixtures/sample-achievement-credential.js';
import { sampleEndorsementCredential } from '../fixtures/sample-endorsement-credential.js';
import { obv3p0OpenBadgeVcdmV1 } from '../fixtures/obv3p0-openbadge-vcdm-v1.js';
import { obv3p0OpenBadgeSpecConforming } from '../fixtures/obv3p0-openbadge-spec-conforming.js';

const schemaSuite: VerificationSuite = {
  id: 'schema.obv3',
  name: 'OBv3 Schema',
  checks: [obv3SchemaCheck]
};

const CHECK_ID = 'unknown.schema.obv3.json';

const clone = (credential: Record<string, unknown>): Record<string, unknown> =>
  structuredClone(credential);

/**
 * A VC 1.1 OpenBadgeCredential that passes AchievementCredentialv1p1. The
 * shared VCDM v1 fixture has no top-level `name`, which that schema requires.
 */
const passingVc1Credential = (): Record<string, unknown> => ({
  ...clone(obv3p0OpenBadgeVcdmV1),
  name: 'Example Course'
});

async function schemaOutcome(
  credential: unknown,
  context: VerificationContext = buildTestContext({
    httpGetService: FakeHttpGetService({})
  })
): Promise<CheckOutcome | undefined> {
  const results = await runSuites(
    [schemaSuite],
    { verifiableCredential: credential },
    context
  );
  return results.find(r => r.id === CHECK_ID)?.outcome;
}

describe('obv3SchemaCheck (bundled Open Badges 3.0 schemas)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes a VC 2.0 OpenBadgeCredential against E.2.1.2 AchievementCredential', async () => {
    const outcome = await schemaOutcome(clone(sampleAchievementCredential));
    expect(outcome).toEqual({
      status: 'success',
      message:
        'OBv3 schema validation passed against E.2.1.2 AchievementCredential (https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential-jsonschema1.json).'
    });
  });

  it('passes a VC 2.0 EndorsementCredential against E.2.1.7 EndorsementCredential', async () => {
    const outcome = await schemaOutcome(clone(sampleEndorsementCredential));
    expect(outcome?.status).toBe('success');
    if (outcome?.status === 'success') {
      expect(outcome.message).toContain('E.2.1.7 EndorsementCredential');
    }
  });

  it('passes a VC 1.1 OpenBadgeCredential against E.2.1.34 AchievementCredentialv1p1', async () => {
    const outcome = await schemaOutcome(passingVc1Credential());
    expect(outcome?.status).toBe('success');
    if (outcome?.status === 'success') {
      expect(outcome.message).toContain('E.2.1.34 AchievementCredentialv1p1');
    }
  });

  it('validates VC 1.1 against the VC 1.1-only schema, never the either-version one', async () => {
    // The purl "Any" schema would report every VC 2.0 branch error as well.
    const credential = passingVc1Credential();
    delete credential.issuanceDate;

    const outcome = await schemaOutcome(credential);
    expect(outcome).toEqual({
      status: 'failure',
      problems: [
        {
          type: 'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_FAILED',
          title: 'Schema Validation Failed',
          detail:
            "Schema validation failed against E.2.1.34 AchievementCredentialv1p1: must have required property 'issuanceDate'"
        }
      ]
    });
  });

  it('ignores credentialSchema: an issuer cannot swap in its own schema, and nothing is fetched', async () => {
    const credential = clone(sampleAchievementCredential);
    delete credential.credentialSubject;
    credential.credentialSchema = [
      {
        id: 'https://issuer.example/permissive.json',
        type: '1EdTechJsonSchemaValidator2019'
      }
    ];
    const http = FakeHttpGetService({});

    const outcome = await schemaOutcome(
      credential,
      buildTestContext({ httpGetService: http })
    );

    expect(outcome?.status).toBe('failure');
    if (outcome?.status === 'failure') {
      expect(outcome.problems).toHaveLength(1);
      expect(outcome.problems[0].type).toBe(
        'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_FAILED'
      );
      expect(outcome.problems[0].detail).toContain(
        "must have required property 'credentialSubject'"
      );
    }
    expect(http.allCalls()).toEqual([]);
  });

  it('reports image.type given as an array, as the upstream schema requires a string', async () => {
    // `['Image']` is JSON-LD-equivalent to `'Image'` and the Zod schemas
    // accept it, but the Open Badges JSON Schema allows only the string.
    // This pins upstream schema behaviour; it is not a verifier bug.
    const outcome = await schemaOutcome(clone(obv3p0OpenBadgeSpecConforming));
    expect(outcome?.status).toBe('failure');
    if (outcome?.status === 'failure') {
      expect(outcome.problems[0].detail).toContain('/image/type');
    }
  });

  it('skips a plain VC without the Open Badges context', async () => {
    const credential = CredentialFactory({
      version: 'v1',
      credential: {
        type: ['VerifiableCredential'],
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/security/suites/ed25519-2020/v1'
        ]
      }
    });
    const results = await runSuites(
      [schemaSuite],
      { verifiableCredential: credential },
      buildTestContext()
    );

    expect(results).toHaveLength(1);
    expect(results[0].outcome.status).toBe('skipped');
  });

  it('skips an Open Badges credential with neither VC context', async () => {
    const credential = clone(sampleAchievementCredential);
    credential['@context'] = [
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
    ];
    const outcome = await schemaOutcome(credential);
    expect(outcome?.status).toBe('skipped');
  });

  it('compiles each schema once per process, shared across verifiers', async () => {
    // A fresh module instance, so earlier tests' compiles do not count.
    vi.resetModules();
    const compile = vi.spyOn(Ajv2020.prototype, 'compile');
    const { obv3SchemaCheck: freshCheck } =
      await import('../../../src/openbadges/schema/obv3-schema-check.js');
    const { runSuites: freshRunSuites } =
      await import('../../../src/run-suites.js');
    const suite: VerificationSuite = { ...schemaSuite, checks: [freshCheck] };

    for (let i = 0; i < 2; i++) {
      const results = await freshRunSuites(
        [suite],
        { verifiableCredential: clone(sampleAchievementCredential) },
        buildTestContext({ httpGetService: FakeHttpGetService({}) })
      );
      expect(results[0].outcome.status).toBe('success');
    }

    expect(compile).toHaveBeenCalledTimes(1);
  });
});
