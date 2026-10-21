/**
 * Pins the Open Badges 3.0 JSON Schemas vendored in
 * `src/openbadges/schema/json-schema/`.
 *
 * - **Integrity:** each module's recorded `$id` and SHA-256 still describe
 *   its schema, so a hand edit to a generated file fails here.
 * - **Drift:** each schema still says what its purl-published twin (committed
 *   under `purl/`) says. The spec embeds draft 2020-12 schemas with `$id`s
 *   that do not resolve; purl publishes draft 2019-09 ones. Once tuple syntax
 *   is rewritten to 2019-09 form, the VC 2.0 schemas equal the purl strict
 *   schemas, and the VC 1.1 (`…v1p1`) schemas equal the VC 1.1 branch of the
 *   purl "Any" schemas.
 *
 * Nothing here fetches. Refresh both sides by hand with
 * `node scripts/refresh-ob-schemas.mjs --fixtures`.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  VENDORED_OB_SCHEMAS,
  type VendoredObSchema
} from '../../../src/openbadges/schema/json-schema/index.js';
import { sampleAchievementCredential } from '../fixtures/sample-achievement-credential.js';
import { sampleEndorsementCredential } from '../fixtures/sample-endorsement-credential.js';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const VC_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1';
const REFRESH =
  'Re-run `node scripts/refresh-ob-schemas.mjs --fixtures` and review the diff.';

type Json = Record<string, unknown>;

function readPurl(name: string): Json {
  return JSON.parse(
    readFileSync(new URL(`./purl/${name}`, import.meta.url), 'utf8')
  ) as Json;
}

function vendored(
  obType: VendoredObSchema['obType'],
  vcVersion: VendoredObSchema['vcVersion']
): VendoredObSchema {
  const found = VENDORED_OB_SCHEMAS.find(
    s => s.obType === obType && s.vcVersion === vcVersion
  );
  if (!found) {
    throw new Error(`No vendored schema for ${obType} / ${vcVersion}`);
  }
  return found;
}

/**
 * Rewrite draft 2020-12 tuple syntax into draft 2019-09 form:
 * `prefixItems: P, items: I` becomes `items: P, additionalItems: I`.
 */
function toDraft2019(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toDraft2019);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const out: Json = {};
  const source = value as Json;
  for (const [key, child] of Object.entries(source)) {
    if (key === 'prefixItems') {
      out.items = toDraft2019(child);
    } else if (key === 'items' && 'prefixItems' in source) {
      out.additionalItems = toDraft2019(child);
    } else {
      out[key] = toDraft2019(child);
    }
  }
  return out;
}

/** Drop the keys that legitimately differ between twins. */
function withoutHeader(schema: Json): Json {
  const { $schema, $id, title, description, ...rest } = schema;
  void [$schema, $id, title, description];
  return rest;
}

function newAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strictTuples: false });
  addFormats.default(ajv);
  return ajv;
}

describe('vendored Open Badges 3.0 JSON Schemas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('vendors one schema per OB type and VC version', () => {
    expect(
      VENDORED_OB_SCHEMAS.map(s => `${s.obType} ${s.vcVersion}`).sort()
    ).toEqual([
      'EndorsementCredential v1',
      'EndorsementCredential v2',
      'OpenBadgeCredential v1',
      'OpenBadgeCredential v2'
    ]);
  });

  describe.each(VENDORED_OB_SCHEMAS.map(s => [s.specSection, s] as const))(
    '%s',
    (_section, vendoredSchema) => {
      it('matches its recorded $id, draft and SHA-256', () => {
        const { schema } = vendoredSchema;
        expect(schema.$id).toBe(vendoredSchema.id);
        expect(schema.$schema).toBe(DRAFT_2020_12);
        const hash = createHash('sha256')
          .update(JSON.stringify(schema))
          .digest('hex');
        expect(hash, `Generated module was edited by hand. ${REFRESH}`).toBe(
          vendoredSchema.sha256
        );
      });

      it('compiles with Ajv2020 without strict-mode output', () => {
        const warn = vi.spyOn(console, 'warn');
        const log = vi.spyOn(console, 'log');
        expect(() => newAjv().compile(vendoredSchema.schema)).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
      });
    }
  );

  describe('drift from the purl-published schemas', () => {
    it.each([
      ['OpenBadgeCredential', 'ob_v3p0_achievementcredential_schema.json'],
      ['EndorsementCredential', 'ob_v3p0_endorsementcredential_schema.json']
    ] as const)('%s VC 2.0 equals purl %s', (obType, purlName) => {
      const spec = toDraft2019(vendored(obType, 'v2').schema) as Json;
      expect(
        withoutHeader(spec),
        `Vendored schema and purl/${purlName} disagree. ${REFRESH}`
      ).toEqual(withoutHeader(readPurl(purlName)));
    });

    it.each([
      ['OpenBadgeCredential', 'ob_v3p0_anyachievementcredential_schema.json'],
      ['EndorsementCredential', 'ob_v3p0_anyendorsementcredential_schema.json']
    ] as const)(
      '%s VC 1.1 equals the VC 1.1 branch of purl %s',
      (obType, purlName) => {
        const any = readPurl(purlName);
        // Find the branch by its context constraint rather than trusting an
        // index: achievement puts VC 1.1 first, endorsement second.
        const branches = any.anyOf as Json[];
        const v1Branches = branches.filter(branch =>
          JSON.stringify(
            (branch.properties as Json | undefined)?.['@context']
          )?.includes(VC_V1_CONTEXT)
        );
        expect(v1Branches).toHaveLength(1);

        const { $defs: specDefs, ...specBody } = toDraft2019(
          vendored(obType, 'v1').schema
        ) as Json;
        const message = `Vendored schema and the VC 1.1 branch of purl/${purlName} disagree. ${REFRESH}`;
        expect(withoutHeader(specBody), message).toEqual(
          withoutHeader(v1Branches[0])
        );

        const anyDefs = any.$defs as Json;
        for (const [name, def] of Object.entries(specDefs as Json)) {
          expect(def, `$defs/${name}: ${message}`).toEqual(anyDefs[name]);
        }
      }
    );
  });

  describe('repo fixtures', () => {
    it('sample achievement credential passes AchievementCredential', () => {
      const validate = newAjv().compile(
        vendored('OpenBadgeCredential', 'v2').schema
      );
      expect(
        validate(sampleAchievementCredential),
        JSON.stringify(validate.errors)
      ).toBe(true);
    });

    it('sample endorsement credential passes EndorsementCredential', () => {
      const validate = newAjv().compile(
        vendored('EndorsementCredential', 'v2').schema
      );
      expect(
        validate(sampleEndorsementCredential),
        JSON.stringify(validate.errors)
      ).toBe(true);
    });
  });
});
