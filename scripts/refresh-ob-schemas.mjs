#!/usr/bin/env node
/**
 * Refresh the Open Badges 3.0 JSON Schemas vendored in
 * `src/openbadges/schema/json-schema/`.
 *
 *   node scripts/refresh-ob-schemas.mjs [--fixtures]
 *
 * Fetches the OB 3.0 specification HTML and extracts the four credential
 * schemas embedded in its appendix (the first `<pre>` after each
 * `…class-schema` anchor). The spec is the source because the VC 1.1-only
 * (`…v1p1`) schemas are published nowhere else.
 *
 * A module whose schema is unchanged is left as it is, so its recorded fetch
 * date keeps meaning "when this content was fetched" and a re-run makes no
 * diff. With `--fixtures`, also downloads the purl-published twins that the
 * drift test in `test/openbadges/schema-files/` compares against.
 *
 * Run by hand only: nothing in build, test, prepack or CI fetches a schema.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const SPEC_URL = 'https://www.imsglobal.org/spec/ob/v3p0/';
const PURL = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/';
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/openbadges/schema/json-schema');
const fixturesDir = join(root, 'test/openbadges/schema-files/purl');

/** The four spec classes, and what each generated module declares. */
const SCHEMAS = [
  {
    specClass: 'achievementcredential',
    section: 'E.2.1.2',
    title: 'AchievementCredential',
    file: 'achievement-credential.ts',
    exportName: 'achievementCredential',
    obType: 'OpenBadgeCredential',
    vcVersion: 'v2'
  },
  {
    specClass: 'achievementcredentialv1p1',
    section: 'E.2.1.34',
    title: 'AchievementCredentialv1p1',
    file: 'achievement-credential-v1p1.ts',
    exportName: 'achievementCredentialV1p1',
    obType: 'OpenBadgeCredential',
    vcVersion: 'v1'
  },
  {
    specClass: 'endorsementcredential',
    section: 'E.2.1.7',
    title: 'EndorsementCredential',
    file: 'endorsement-credential.ts',
    exportName: 'endorsementCredential',
    obType: 'EndorsementCredential',
    vcVersion: 'v2'
  },
  {
    specClass: 'endorsementcredentialv1p1',
    section: 'E.2.1.36',
    title: 'EndorsementCredentialv1p1',
    file: 'endorsement-credential-v1p1.ts',
    exportName: 'endorsementCredentialV1p1',
    obType: 'EndorsementCredential',
    vcVersion: 'v1'
  }
].map(s => ({
  ...s,
  id: `${PURL}ob_v3p0_${s.specClass}-jsonschema1.json`
}));

/** The purl-published twins, saved as test fixtures with `--fixtures`. */
const PURL_FIXTURES = [
  'ob_v3p0_achievementcredential_schema.json',
  'ob_v3p0_anyachievementcredential_schema.json',
  'ob_v3p0_endorsementcredential_schema.json',
  'ob_v3p0_anyendorsementcredential_schema.json'
];

const NAMED_ENTITIES = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const hex = name[1] === 'x' || name[1] === 'X';
      return String.fromCodePoint(
        parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
      );
    }
    const decoded = NAMED_ENTITIES[name.toLowerCase()];
    if (decoded === undefined) {
      throw new Error(`Unknown HTML entity ${match}`);
    }
    return decoded;
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

/** Extract and check one embedded schema; throws rather than guess. */
function extractSchema(html, spec) {
  const anchor = `id="org.1edtech.ob.v3p0.${spec.specClass}.class-schema"`;
  const start = html.indexOf(anchor);
  if (start === -1) {
    throw new Error(`Spec has no anchor ${anchor}`);
  }

  const heading = html
    .slice(start, html.indexOf('</h', start))
    .match(/<bdi class="secno">\s*([^<]+?)\s*<\/bdi>\s*([^<]+)/);
  if (
    !heading ||
    heading[1] !== spec.section ||
    heading[2].trim() !== spec.title
  ) {
    throw new Error(
      `Expected section ${spec.section} ${spec.title} at ${anchor}, found ${heading ? `${heading[1]} ${heading[2]}` : 'no heading'}`
    );
  }

  const pre = html.slice(start).match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (!pre) {
    throw new Error(`No <pre> after ${anchor}`);
  }
  const schema = JSON.parse(decodeEntities(pre[1].replace(/<[^>]*>/g, '')));

  if (schema.$id !== spec.id) {
    throw new Error(`${spec.title}: $id is ${schema.$id}, expected ${spec.id}`);
  }
  if (schema.$schema !== DRAFT_2020_12) {
    throw new Error(
      `${spec.title}: $schema is ${schema.$schema}, expected ${DRAFT_2020_12}`
    );
  }
  return schema;
}

function sha256(schema) {
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

async function renderModule(spec, schema, hash, prettierOptions) {
  const date = new Date().toISOString().slice(0, 10);
  const source = `// Generated by scripts/refresh-ob-schemas.mjs — do not edit.
// Run \`node scripts/refresh-ob-schemas.mjs\` to refresh.
import type { VendoredObSchema } from './index.js';

/**
 * Open Badges 3.0 §${spec.section} ${spec.title} JSON Schema.
 *
 * Generated by \`scripts/refresh-ob-schemas.mjs\` from
 * ${SPEC_URL} on ${date}. Do not edit.
 */
export const ${spec.exportName}: VendoredObSchema = {
  id: ${JSON.stringify(spec.id)},
  specSection: ${JSON.stringify(`${spec.section} ${spec.title}`)},
  obType: ${JSON.stringify(spec.obType)},
  vcVersion: ${JSON.stringify(spec.vcVersion)},
  sha256: ${JSON.stringify(hash)},
  schema: ${JSON.stringify(schema, null, 2)}
};
`;
  return prettier.format(source, { ...prettierOptions, parser: 'typescript' });
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function main() {
  const withFixtures = process.argv.includes('--fixtures');

  console.log(`Fetching ${SPEC_URL}`);
  const html = await fetchText(SPEC_URL);

  // Extract all four before writing any, so a changed spec writes nothing.
  const extracted = SCHEMAS.map(spec => {
    const schema = extractSchema(html, spec);
    return { spec, schema, hash: sha256(schema) };
  });

  const prettierOptions =
    (await prettier.resolveConfig(join(outDir, 'index.ts'))) ?? {};
  await mkdir(outDir, { recursive: true });
  for (const { spec, schema, hash } of extracted) {
    const path = join(outDir, spec.file);
    const existing = await readIfExists(path);
    if (existing?.includes(`sha256: '${hash}'`)) {
      console.log(`unchanged  ${spec.file}`);
      continue;
    }
    await writeFile(
      path,
      await renderModule(spec, schema, hash, prettierOptions)
    );
    console.log(
      `${existing ? 'updated  ' : 'created  '}  ${spec.file}  ${hash}`
    );
  }

  if (withFixtures) {
    await mkdir(fixturesDir, { recursive: true });
    for (const name of PURL_FIXTURES) {
      const text = await fetchText(PURL + name);
      JSON.parse(text);
      await writeFile(join(fixturesDir, name), text);
      console.log(`fixture    ${name}`);
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
