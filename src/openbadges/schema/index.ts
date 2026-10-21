/**
 * Public submodule entry point:
 * `@digitalcredentials/verifier-core/openbadges/schema`.
 *
 * Open Badges 3.0 JSON Schema validation. Everything here loads AJV and
 * the four Open Badges 3.0 schemas bundled with this package (about
 * 270 KB of schema JSON), and compiles a schema with `new Function` on
 * first use. That is why it is a separate entry point:
 * `@digitalcredentials/verifier-core/openbadges` holds the semantic
 * checks, recognizers, Zod schemas and problem types, and loads no AJV.
 * Pages whose Content Security Policy forbids `unsafe-eval` should use
 * `openBadgesSemanticSuite` from there instead.
 *
 * Like the rest of the OpenBadges surface, nothing here is part of the
 * default verifier: pass a suite via a verify call's `additionalSuites`.
 * Nothing here fetches a schema, and a credential's `credentialSchema`
 * never chooses the schema it is validated against.
 *
 * The surface is:
 *
 * - **Suites**: {@link openBadgesSuite} (semantic checks plus schema
 *   validation) and {@link openBadgesSchemaSuite} (schema validation
 *   only). Both apply to OpenBadgeCredential and EndorsementCredential.
 * - **Individual checks**: {@link obv3SchemaCheck} (validates against
 *   the schema for the credential's type and VC version) and
 *   {@link obv3DeclaredSchemaCheck} (reports a declared
 *   `credentialSchema` that does not fit).
 */

export { openBadgesSuite, openBadgesSchemaSuite } from './schema-suites.js';
export { obv3SchemaCheck } from './obv3-schema-check.js';
export { obv3DeclaredSchemaCheck } from './obv3-declared-schema-check.js';
