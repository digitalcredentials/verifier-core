/**
 * Integration spec for the public OpenBadges submodule.
 *
 * Pins three contracts that no per-check unit spec covers:
 *
 * 1. **The `package.json#exports` entry resolves at runtime.** A
 *    dynamic `import('@digitalcredentials/verifier-core/openbadges')`
 *    catches typos in `exports` and missing re-exports in
 *    `src/openbadges/index.ts`.
 * 2. **Default-path invariant (Q2).** A vanilla
 *    `createVerifier()` against a real OB credential emits zero
 *    OB-related `CheckResult` entries.
 * 3. **Opt-in path emits OB findings.** Adding `openBadgesSuite`
 *    via `additionalSuites` produces both semantic and schema OB
 *    results, and a mutated fixture surfaces
 *    `OB_INVALID_ACHIEVED_LEVEL`.
 *
 * The static imports use the relative `../../src/openbadges/index.js`
 * path so this spec compiles under the repo's `moduleResolution:
 * node` setting (which predates `package.json#exports` support in
 * the TS resolver). The runtime `exports` contract is exercised by
 * the dynamic-import test below.
 */

import { describe, it, expect } from 'vitest';
import { createVerifier } from '../../src/verifier.js';
import {
  openBadgesSuite,
  openBadgesSemanticSuite,
  openBadgesSchemaSuite,
  obv3ResultRefCheck,
  obv3AchievedLevelCheck,
  obv3MissingResultStatusCheck,
  obv3UnknownAchievementTypeCheck,
  createObv3UnknownAchievementTypeCheck,
  obv3SchemaCheck,
  isOpenBadgeCredential,
  isEndorsementCredential,
  OpenBadgesProblemTypes,
  Obv3ProblemTypes,
  KNOWN_ACHIEVEMENT_TYPES,
  OB_3_0_ACHIEVEMENT_TYPES,
  ACHIEVEMENT_TYPE_EXT_PREFIX
} from '../../src/openbadges/index.js';
import { FakeCryptoService } from '../factories/services/fake-crypto-service.js';
import {
  FakeHttpGetService,
  okJsonBody
} from '../factories/services/fake-http-get-service.js';
import { sampleAchievementCredential } from './fixtures/sample-achievement-credential.js';

const OBV3_V2_ACHIEVEMENT_SCHEMA_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json';

/** Permissive JSON Schema — accepts any object. Keeps the AJV check
 * exercised end-to-end without coupling this spec to schema details. */
function acceptAllSchema($id: string): Record<string, unknown> {
  return {
    $id,
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    additionalProperties: true
  };
}

function cloneCredential(): Record<string, unknown> {
  return structuredClone(sampleAchievementCredential);
}

// Verbose verifier so OB check ids surface in `results[]`
// regardless of outcome; folded mode hides successes.
const fakeVerified = {
  cryptoServices: [FakeCryptoService({ verified: true })],
  verbose: true
};

describe('@digitalcredentials/verifier-core/openbadges (integration)', () => {
  it('resolves the ./openbadges entry via package.json#exports', async () => {
    // Dynamic import via variable so the TS resolver (configured for
    // legacy `node` moduleResolution that pre-dates package `exports`
    // support) doesn't try to resolve the path at compile time. Node's
    // ESM resolver handles it at runtime via package self-reference.
    const submodulePath = '@digitalcredentials/verifier-core/openbadges';
    const mod = (await import(submodulePath)) as Record<string, unknown>;
    expect(mod.openBadgesSuite, 'openBadgesSuite').toBeDefined();
    expect(
      mod.openBadgesSemanticSuite,
      'openBadgesSemanticSuite'
    ).toBeDefined();
    expect(mod.openBadgesSchemaSuite, 'openBadgesSchemaSuite').toBeDefined();
    expect(mod.obv3SchemaCheck, 'obv3SchemaCheck').toBeDefined();
    expect(mod.createObv3UnknownAchievementTypeCheck).toBeTypeOf('function');
    expect(mod.isOpenBadgeCredential).toBeTypeOf('function');
    expect(mod.OpenBadgesProblemTypes).toBe(mod.Obv3ProblemTypes);
  });

  it('exposes the documented surface from the static import', () => {
    expect(openBadgesSuite.id).toBe('openbadges');
    expect(openBadgesSemanticSuite.id).toBe('openbadges.semantic');
    expect(openBadgesSchemaSuite.id).toBe('openbadges.schema');

    expect(openBadgesSemanticSuite.checks).toEqual(
      expect.arrayContaining([
        obv3ResultRefCheck,
        obv3AchievedLevelCheck,
        obv3MissingResultStatusCheck,
        obv3UnknownAchievementTypeCheck
      ])
    );
    expect(openBadgesSchemaSuite.checks).toContain(obv3SchemaCheck);

    expect(isOpenBadgeCredential(sampleAchievementCredential)).toBe(true);
    expect(isEndorsementCredential(sampleAchievementCredential)).toBe(false);

    expect(OpenBadgesProblemTypes).toBe(Obv3ProblemTypes);
    expect(OpenBadgesProblemTypes.OB_INVALID_ACHIEVED_LEVEL).toBeTypeOf(
      'string'
    );

    expect(KNOWN_ACHIEVEMENT_TYPES).toBe(OB_3_0_ACHIEVEMENT_TYPES);
    expect(ACHIEVEMENT_TYPE_EXT_PREFIX).toBe('ext:');
  });

  it('runs no OB checks by default (Q2 invariant)', async () => {
    const verifier = createVerifier(fakeVerified);
    const result = await verifier.verifyCredential({
      credential: cloneCredential()
    });

    const obResults = result.results.filter(
      r => r.suite.startsWith('openbadges') || r.suite.startsWith('schema.obv3')
    );
    expect(obResults).toHaveLength(0);
  });

  it('runs OB semantic + schema checks when openBadgesSuite is opted in', async () => {
    const httpGetService = FakeHttpGetService({
      [OBV3_V2_ACHIEVEMENT_SCHEMA_URL]: okJsonBody(
        acceptAllSchema(OBV3_V2_ACHIEVEMENT_SCHEMA_URL)
      )
    });

    const verifier = createVerifier({ ...fakeVerified, httpGetService });
    const result = await verifier.verifyCredential({
      credential: cloneCredential(),
      additionalSuites: [openBadgesSuite]
    });

    const obSuiteResults = result.results.filter(r => r.suite === 'openbadges');
    const checkIds = new Set(obSuiteResults.map(r => r.check));
    expect(checkIds).toContain('schema.obv3.result-ref');
    expect(checkIds).toContain('schema.obv3.achieved-level');
    expect(checkIds).toContain('schema.obv3.missing-result-status');
    expect(checkIds).toContain('schema.obv3.unknown-achievement-type');
    expect(checkIds).toContain('schema.obv3.json');

    const failures = obSuiteResults.filter(r => r.outcome.status === 'failure');
    expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0);
  });

  it('emits OB_INVALID_ACHIEVED_LEVEL on a mutated credential', async () => {
    const credential = cloneCredential();
    const subject = credential.credentialSubject as {
      result: Array<{ achievedLevel: string }>;
    };
    subject.result[0].achievedLevel = 'urn:lvl:NOT_REAL';

    const verifier = createVerifier(fakeVerified);
    const result = await verifier.verifyCredential({
      credential,
      additionalSuites: [openBadgesSemanticSuite]
    });

    const achievedLevelResult = result.results.find(
      r => r.check === 'schema.obv3.achieved-level'
    );
    expect(achievedLevelResult?.outcome.status).toBe('failure');

    const problems =
      achievedLevelResult?.outcome.status === 'failure'
        ? achievedLevelResult.outcome.problems
        : [];
    expect(problems.map(p => p.type)).toContain(
      OpenBadgesProblemTypes.OB_INVALID_ACHIEVED_LEVEL
    );
  });

  it('emits a synthetic <suite-id>.applies skip when openBadgesSuite is queued against a non-OB credential', async () => {
    const nonObCredential: Record<string, unknown> = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'https://example.test/credentials/non-ob',
      type: ['VerifiableCredential'],
      issuer: 'https://example.test/issuer',
      validFrom: '2024-01-01T00:00:00Z',
      credentialSubject: { id: 'did:example:subject' }
    };

    const verifier = createVerifier(fakeVerified);
    const result = await verifier.verifyCredential({
      credential: nonObCredential,
      additionalSuites: [openBadgesSuite]
    });

    const obSuiteResults = result.results.filter(r => r.suite === 'openbadges');
    expect(obSuiteResults).toHaveLength(1);
    expect(obSuiteResults[0].check).toBe('openbadges.applies');
    expect(obSuiteResults[0].outcome.status).toBe('skipped');
    if (obSuiteResults[0].outcome.status === 'skipped') {
      expect(obSuiteResults[0].outcome.reason).toBe(
        'suite predicate returned false'
      );
    }
  });

  it('createObv3UnknownAchievementTypeCheck composes a custom-vocab check', async () => {
    const credential = cloneCredential();
    const achievement = (
      credential.credentialSubject as {
        achievement: { achievementType: string };
      }
    ).achievement;
    achievement.achievementType = 'CompanyInternal';

    const customCheck = createObv3UnknownAchievementTypeCheck({
      additionalKnownTypes: ['CompanyInternal']
    });

    const verifier = createVerifier(fakeVerified);
    const result = await verifier.verifyCredential({
      credential,
      additionalSuites: [
        {
          id: 'openbadges.custom',
          name: 'OpenBadges Custom Vocab',
          description:
            'Test-only suite wrapping createObv3UnknownAchievementTypeCheck.',
          checks: [customCheck]
        }
      ]
    });

    const customResult = result.results.find(
      r => r.suite === 'openbadges.custom'
    );
    expect(customResult?.outcome.status).toBe('success');
  });
});
