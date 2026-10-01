import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { obv3SchemaSuite } from '../../src/suites/schema/obv3/index.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { FakeFetchJson } from '../factories/services/fake-fetch-json.js';

const OBV3_V2_ACHIEVEMENT_SCHEMA_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json';

const OBV3_V2_ENDORSEMENT_SCHEMA_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorsementcredential_schema.json';

function minimalSchema($id: string): Record<string, unknown> {
  return {
    $id,
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    required: ['@context', 'type', 'issuer', 'credentialSubject'],
    additionalProperties: true,
    properties: {
      '@context': {},
      type: {},
      issuer: {},
      credentialSubject: {}
    }
  };
}

describe('OBv3 Schema Suite', () => {
  const createSubject = (credential: unknown): VerificationSubject => ({
    verifiableCredential: credential
  });

  describe('OBv3 schema check', () => {
    it('skips when credential is not OBv3-shaped', async () => {
      const cred = CredentialFactory({
        version: 'v1',
        credential: {
          type: ['VerifiableCredential'],
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://w3id.org/security/suites/ed25519-2020/v1'
          ]
        }
      });
      const context = buildTestContext({
        fetchJson: FakeFetchJson({})
      });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('skipped');
    });

    it('validates OpenBadgeCredential when schema is served locally', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      const fetchJson = FakeFetchJson({
        [OBV3_V2_ACHIEVEMENT_SCHEMA_URL]: minimalSchema(
          OBV3_V2_ACHIEVEMENT_SCHEMA_URL
        )
      });
      const context = buildTestContext({ fetchJson });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('success');
    });

    it('validates EndorsementCredential when schema is served locally', async () => {
      const cred = CredentialFactory({
        version: 'v2',
        credential: { type: ['VerifiableCredential', 'EndorsementCredential'] }
      });
      const fetchJson = FakeFetchJson({
        [OBV3_V2_ENDORSEMENT_SCHEMA_URL]: minimalSchema(
          OBV3_V2_ENDORSEMENT_SCHEMA_URL
        )
      });
      const context = buildTestContext({ fetchJson });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('success');
    });

    it('fails AJV validation when credential is missing required fields', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      delete (cred as { credentialSubject?: unknown }).credentialSubject;

      const fetchJson = FakeFetchJson({
        [OBV3_V2_ACHIEVEMENT_SCHEMA_URL]: minimalSchema(
          OBV3_V2_ACHIEVEMENT_SCHEMA_URL
        )
      });
      const context = buildTestContext({ fetchJson });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('failure');
      if (schemaCheck?.outcome.status === 'failure') {
        expect(schemaCheck.outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_FAILED'
        );
      }
    });

    it('uses credentialSchema id when specified', async () => {
      const customUrl = 'https://factory.test/custom-credential-schema.json';
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialSchema: {
            id: customUrl,
            type: 'JsonSchemaValidator2018'
          }
        }
      });
      const fetchJson = FakeFetchJson({
        [customUrl]: minimalSchema(customUrl)
      });
      const context = buildTestContext({ fetchJson });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('success');
    });

    it('uses first credentialSchema entry when property is an array', async () => {
      const customUrl = 'https://factory.test/array-first-schema.json';
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          credentialSchema: [
            { id: customUrl, type: 'JsonSchemaValidator2018' },
            {
              id: 'https://factory.test/ignored.json',
              type: 'JsonSchemaValidator2018'
            }
          ]
        }
      });
      const fetchJson = FakeFetchJson({
        [customUrl]: minimalSchema(customUrl)
      });
      const context = buildTestContext({ fetchJson });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('success');
    });

    it('fails when schema URL cannot be fetched', async () => {
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      const context = buildTestContext({
        fetchJson: FakeFetchJson({})
      });
      const results = await runSuites(
        [obv3SchemaSuite],
        createSubject(cred),
        context
      );

      const schemaCheck = results.find(r => r.check === 'schema.obv3.json');
      expect(schemaCheck?.outcome.status).toBe('failure');
      if (schemaCheck?.outcome.status === 'failure') {
        expect(schemaCheck.outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#SCHEMA_VALIDATION_ERROR'
        );
        expect(schemaCheck.outcome.problems[0].detail).toContain(
          'No fake response'
        );
      }
    });
  });

  describe('non-OBv3 credential types', () => {
    it('skips schema check for plain VC without OBv3 context', async () => {
      const cred = CredentialFactory({
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
        [obv3SchemaSuite],
        createSubject(cred),
        buildTestContext()
      );

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('skipped');
    });
  });
});
