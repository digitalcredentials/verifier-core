import { describe, it, expect } from 'vitest';
import { runSuites } from '../../../src/run-suites.js';
import { createVerifier } from '../../../src/verifier.js';
import { obv3DeclaredSchemaCheck } from '../../../src/openbadges/schema/obv3-declared-schema-check.js';
import { KNOWN_OB_SCHEMA_URLS } from '../../../src/openbadges/schema/known-schema-urls.js';
import { VENDORED_OB_SCHEMAS } from '../../../src/openbadges/schema/json-schema/index.js';
import { openBadgesSuite } from '../../../src/openbadges/schema/index.js';
import { OpenBadgesProblemTypes } from '../../../src/openbadges/index.js';
import type {
  CheckOutcome,
  VerificationSuite
} from '../../../src/types/check.js';
import { buildTestContext } from '../../factories/services/build-test-context.js';
import { FakeHttpGetService } from '../../factories/services/fake-http-get-service.js';
import { FakeCryptoService } from '../../factories/services/fake-crypto-service.js';
import { sampleAchievementCredential } from '../fixtures/sample-achievement-credential.js';
import { obv3p0OpenBadgeVcdmV1 } from '../fixtures/obv3p0-openbadge-vcdm-v1.js';

const P = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/';
const STRICT_JSON = `${P}json/ob_v3p0_achievementcredential_schema.json`;
const STRICT_JSON_LD = `${P}json-ld/ob_v3p0_achievementcredential_schema.json`;
const ANY = `${P}json/ob_v3p0_anyachievementcredential_schema.json`;
const ANY_JSON_LD = `${P}json-ld/ob_v3p0_anyachievementcredential_schema.json`;
const SPEC_V2 = `${P}json/ob_v3p0_achievementcredential-jsonschema1.json`;
const SPEC_V1P1 = `${P}json/ob_v3p0_achievementcredentialv1p1-jsonschema1.json`;
const ENDORSEMENT = `${P}json/ob_v3p0_endorsementcredential_schema.json`;
const UNKNOWN = 'https://issuer.example/my-schema.json';

const MISMATCH = OpenBadgesProblemTypes.OB_DECLARED_SCHEMA_MISMATCH;
const NOT_CHECKED = OpenBadgesProblemTypes.OB_DECLARED_SCHEMA_NOT_CHECKED;

const declaredSuite: VerificationSuite = {
  id: 'schema.obv3',
  name: 'OBv3 Schema',
  checks: [obv3DeclaredSchemaCheck]
};

const entry = (id: string) => ({ id, type: '1EdTechJsonSchemaValidator2019' });

function vc2(credentialSchema?: unknown): Record<string, unknown> {
  const credential = structuredClone(sampleAchievementCredential);
  delete credential.credentialSchema;
  return credentialSchema === undefined
    ? credential
    : { ...credential, credentialSchema };
}

function vc1(credentialSchema?: unknown): Record<string, unknown> {
  const credential = structuredClone(obv3p0OpenBadgeVcdmV1);
  return credentialSchema === undefined
    ? credential
    : { ...credential, credentialSchema };
}

const http = FakeHttpGetService({});

async function declaredOutcome(
  credential: unknown
): Promise<CheckOutcome | undefined> {
  const results = await runSuites(
    [declaredSuite],
    { verifiableCredential: credential },
    buildTestContext({ httpGetService: http })
  );
  return results.find(r => r.id === 'unknown.schema.obv3.declared')?.outcome;
}

function problemsOf(outcome: CheckOutcome | undefined) {
  expect(outcome?.status).toBe('failure');
  return outcome?.status === 'failure' ? outcome.problems : [];
}

describe('obv3DeclaredSchemaCheck', () => {
  it('lists the four vendored schema $ids among the known URLs', () => {
    const specIds = [...KNOWN_OB_SCHEMA_URLS.keys()].filter(url =>
      url.endsWith('-jsonschema1.json')
    );
    expect(specIds.sort()).toEqual(VENDORED_OB_SCHEMAS.map(s => s.id).sort());
    expect(KNOWN_OB_SCHEMA_URLS.size).toBe(12);
  });

  it('A: skips when no credentialSchema is declared', async () => {
    expect(await declaredOutcome(vc2())).toEqual({
      status: 'skipped',
      reason: 'No credentialSchema declared.'
    });
  });

  it.each([STRICT_JSON, STRICT_JSON_LD, ANY, ANY_JSON_LD, SPEC_V2])(
    'B: succeeds for a VC 2.0 OpenBadgeCredential declaring %s',
    async url => {
      const outcome = await declaredOutcome(vc2([entry(url)]));
      expect(outcome?.status).toBe('success');
    }
  );

  it.each([ANY, ANY_JSON_LD, SPEC_V1P1])(
    'B: succeeds for a VC 1.1 OpenBadgeCredential declaring %s',
    async url => {
      const outcome = await declaredOutcome(vc1([entry(url)]));
      expect(outcome?.status).toBe('success');
    }
  );

  it('C: reports a VC 2.0 OpenBadgeCredential declaring the endorsement schema', async () => {
    const problems = problemsOf(
      await declaredOutcome(vc2([entry(ENDORSEMENT)]))
    );
    expect(problems).toEqual([
      {
        type: MISMATCH,
        title: 'Declared Schema Does Not Match Credential',
        detail: `credentialSchema declares ${ENDORSEMENT}, an Open Badges schema for EndorsementCredential / VC 2.0, but this is an OpenBadgeCredential using VC 2.0. It was validated against E.2.1.2 AchievementCredential instead.`,
        instance: '/credentialSchema/0'
      }
    ]);
  });

  it('C: reports a VC 1.1 OpenBadgeCredential declaring the VC 2.0-only schema', async () => {
    const problems = problemsOf(
      await declaredOutcome(vc1([entry(STRICT_JSON)]))
    );
    expect(problems.map(p => p.type)).toEqual([MISMATCH]);
    expect(problems[0].detail).toContain(
      'validated against E.2.1.34 AchievementCredentialv1p1'
    );
  });

  it('C: reports a VC 2.0 OpenBadgeCredential declaring the v1p1 schema', async () => {
    const problems = problemsOf(await declaredOutcome(vc2([entry(SPEC_V1P1)])));
    expect(problems.map(p => p.type)).toEqual([MISMATCH]);
    expect(problems[0].detail).toContain('/ VC 1.1, but');
  });

  it('D: reports an unknown URL, without fetching it', async () => {
    const problems = problemsOf(await declaredOutcome(vc2([entry(UNKNOWN)])));
    expect(problems).toEqual([
      {
        type: NOT_CHECKED,
        title: 'Declared Schema Not Checked',
        detail: `credentialSchema declares ${UNKNOWN}, which is not a known Open Badges 3.0 schema. It was not fetched or checked; the credential was validated against E.2.1.2 AchievementCredential.`,
        instance: '/credentialSchema/0'
      }
    ]);
  });

  it('D: reports an unknown URL even alongside one that fits', async () => {
    const problems = problemsOf(
      await declaredOutcome(vc2([entry(STRICT_JSON), entry(UNKNOWN)]))
    );
    expect(problems.map(p => [p.type, p.instance])).toEqual([
      [NOT_CHECKED, '/credentialSchema/1']
    ]);
  });

  it('C + D: reports both in one failure', async () => {
    const problems = problemsOf(
      await declaredOutcome(vc2([entry(ENDORSEMENT), entry(UNKNOWN)]))
    );
    expect(problems.map(p => [p.type, p.instance])).toEqual([
      [MISMATCH, '/credentialSchema/0'],
      [NOT_CHECKED, '/credentialSchema/1']
    ]);
  });

  it('points at /credentialSchema for a single-object declaration', async () => {
    const problems = problemsOf(await declaredOutcome(vc2(entry(UNKNOWN))));
    expect(problems[0].instance).toBe('/credentialSchema');
  });

  it('ignores an entry without a string id', async () => {
    const outcome = await declaredOutcome(
      vc2([{ type: 'JsonSchema' }, entry(STRICT_JSON)])
    );
    expect(outcome?.status).toBe('success');
  });

  it('skips a credential that is not an Open Badges credential', async () => {
    const credential = {
      ...vc2([entry(UNKNOWN)]),
      type: ['VerifiableCredential']
    };
    expect((await declaredOutcome(credential))?.status).toBe('skipped');
  });

  it('made no HTTP request in any case above', () => {
    expect(http.allCalls()).toEqual([]);
  });

  it('runs alongside schema.obv3.json in openBadgesSuite without changing verified', async () => {
    const httpGetService = FakeHttpGetService({});
    const verifier = createVerifier({
      cryptoServices: [FakeCryptoService({ verified: true })],
      httpGetService
    });
    const result = await verifier.verifyCredential({
      credential: vc2([entry(UNKNOWN)]),
      additionalSuites: [openBadgesSuite]
    });

    const outcome = (id: string) =>
      result.results.find(r => r.id === `semantic.openbadges.${id}`)?.outcome
        .status;
    expect(outcome('schema.obv3.json')).toBe('success');
    expect(outcome('schema.obv3.declared')).toBe('failure');
    expect(result.verified).toBe(true);
    expect(httpGetService.allCalls()).toEqual([]);
  });
});
