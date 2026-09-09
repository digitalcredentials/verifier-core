# Architecture

> Internal architecture guide for developers, agents, and downstream consumers.
> For the public API and usage examples, see the [README](../README.md).

## Library overview

`@digitalcredentials/verifier-core` verifies [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0/)
(v1, v1.1, and v2) across Node.js, browsers, and React Native. It checks structure, cryptographic
signatures, revocation/suspension status, issuer trust, and schema conformance — then returns a
structured report that lets consumers decide what "valid" means for their use case.

The library has one entry point (`src/index.ts`), and two modes:

- **Standalone wrappers** — `verifyCredential` and `verifyPresentation` for one-shot use. Each
  call constructs a fresh verifier internally; convenient when you only need a single verification.
- **Factory** — `createVerifier(config)` returns a `Verifier` whose `verifyCredential` and
  `verifyPresentation` methods share long-lived dependencies (HTTP, cache, crypto, document loader,
  registries). Use this for batch or repeated verification so issuer DID documents, status list
  credentials, and JSON-LD contexts are fetched once and reused.

## Directory structure

```
src/
├── index.ts                         Public API barrel (all exports)
├── verifier.ts                      createVerifier(config) factory + internal context builder (composition root)
├── verify-suite.ts                  Standalone verifyCredential / verifyPresentation wrappers over createVerifier
├── default-suites.ts                Internal: defaultSuites array (core → recognition → proof → status → registry); Open Badges suites are opt-in via the `/openbadges` submodule
├── default-services.ts              Internal: lazy factories for default httpGetService, cryptoServices, documentLoader (memoized) + per-call createDefaultCacheService
├── run-suites.ts                    Suite orchestration engine
├── crypto-dispatch.ts               Shared CryptoService selection + invocation (proof suite and status suite)
├── extract-credentials-from.ts      Normalize VP's embedded credentials to array
├── flatten-presentation-results.ts  flattenPresentationResults helper + FlattenedCheckResult provenance-tagged union
├── problem-types.ts                 ProblemTypes const map + ProblemType union (catalog of built-in ProblemDetail.type URIs)
├── declarations.d.ts                Ambient type declarations for untyped DCC packages
├── schemas/                         Zod parsing schemas
│   ├── index.ts                     Re-exports parseCredential, parsePresentation
│   ├── credential.ts                VC schema (v1 + v2 union)
│   ├── presentation.ts              VP schema
│   ├── issuer.ts                    Issuer field schema
│   ├── proof.ts                     Proof field schema
│   └── jsonld-field.ts              @context field schema
├── services/                        Ports and adapters for injectable dependencies
│   ├── cache-service/               CacheService port + InMemoryCacheService adapter
│   ├── http-get-service/            HttpGetService port + BuiltinHttpGetService (fetch-based) adapter
│   ├── data-integrity-crypto.ts     Default CryptoService implementation (Data Integrity / Linked Data Proofs)
│   ├── registry-lookup.ts           createRegistryLookup factory: builds a LookupIssuers from handlers + cache
│   └── registry-handlers/           Per-type registry handlers behind a port
│       ├── types.ts                 RegistryHandler, RegistryHandlerMap, RegistryHandlerContext
│       ├── dcc-legacy-handler.ts    DCC legacy DID-list registry
│       ├── oidf-handler.ts          OpenID Federation entity-statement registry
│       ├── vc-recognition-handler.ts Recognition VC registry (recursively verified via the parent Verifier)
│       └── cache-ttl.ts             TTL helpers (Cache-Control, validUntil)
├── suites/                          Verification suite implementations (default suites only)
│   ├── core/                        Structure checks (context, VC context, credential id, proof exists)
│   ├── recognition/                 Pluggable recognizer dispatch; produces normalized credential form
│   ├── proof/                       Cryptographic signature verification (dispatches to CryptoService)
│   ├── status/                      BitstringStatusList revocation/suspension
│   ├── registry/                    Issuer DID lookup via context.lookupIssuers
│   └── schema/obv3/                 AJV-backed OBv3 JSON Schema check; consumed by the openBadgesSchemaSuite bundle in the /openbadges submodule
├── openbadges/                      Opt-in submodule (published as `@digitalcredentials/verifier-core/openbadges`)
│   ├── index.ts                     Curated barrel — suites, individual checks, factory, recognition helpers, problem-type catalog, vocabulary
│   ├── openbadges-suite.ts          Three suite bundles: openBadgesSuite, openBadgesSemanticSuite, openBadgesSchemaSuite (all phase: 'semantic')
│   ├── openbadges-zod.ts            Internal tolerant Zod shapes (CredentialSubject / Achievement / Result / ResultDescription)
│   ├── recognize.ts                 isOpenBadgeCredential / isEndorsementCredential predicates (also consumed by suites/schema/obv3/)
│   ├── recognizers.ts               obv3p0Recognizer + obv3p0EndorsementRecognizer (RecognizerSpec implementations)
│   ├── problem-types.ts             Obv3ProblemTypes catalog (also exported as OpenBadgesProblemTypes)
│   ├── known-achievement-types.ts   OB_3_0_ACHIEVEMENT_TYPES set + KNOWN_ACHIEVEMENT_TYPES default alias + ACHIEVEMENT_TYPE_EXT_PREFIX
│   ├── result-ref-check.ts          Result.resultDescription → declared ResultDescription.id reference check
│   ├── achieved-level-check.ts      Result.achievedLevel → RubricCriterionLevel.id reference check
│   ├── missing-result-status-check.ts  Result.status presence check when ResultDescription.resultType is 'Status'
│   ├── unknown-achievement-type-check.ts  AchievementType vocabulary check (+ createObv3UnknownAchievementTypeCheck factory)
│   └── schemas/                     Strict OB 3.0 envelope Zod schemas (recognition pipeline)
│       ├── fields-v3p0.ts           Shared field builders (IriString, JsonLdTypeField, Obv3p0ContextArray, zodErrorToProblems)
│       ├── classes-v3p0.ts          Inner class schemas (Image, Profile, Achievement, AchievementSubject, Result, ResultDescription, RubricCriterionLevel) + ProfileRefField + ImageField
│       ├── openbadge-credential-v3p0.ts  Strict envelope + parseObv3p0OpenBadgeCredential
│       └── endorsement-credential-v3p0.ts  Strict envelope + parseObv3p0EndorsementCredential
├── types/                           TypeScript type definitions
│   ├── verifier.ts                  Verifier, VerifierConfig (incl. `recognizers`, `phases`), VerifyCredentialCall, VerifyPresentationCall
│   ├── options.ts                   VerifyCredentialOptions / VerifyPresentationOptions = VerifierConfig & VerifyXCall (compat aliases)
│   ├── check.ts                     CheckOutcome, CheckResult, VerificationCheck, VerificationSuite (incl. `applies`, `phase`), SuitePhase
│   ├── context.ts                   VerificationContext, DocumentLoader, FetchJson
│   ├── crypto-service.ts            CryptoService port
│   ├── crypto-suite.ts              CryptoSuite types (legacy LDP / Data Integrity)
│   ├── recognition.ts               RecognizerSpec, RecognitionResult (recognition plugin contract)
│   ├── result.ts                    CredentialVerificationResult / PresentationVerificationResult (incl. `normalizedVerifiableCredential`, `recognizedProfile`, `partial`)
│   ├── http.ts                      HttpGetResult
│   ├── subject.ts                   VerificationSubject
│   ├── problem-detail.ts            ProblemDetail (RFC 9457-inspired; carries `instance` JSON Pointer)
│   └── registry.ts                  EntityIdentityRegistry, LookupIssuers, RegistryLookupResult
└── util/                            Internal helpers
    ├── document-loader-from-http-get.ts  Build a JSON-LD loader backed by an HttpGetService
    ├── did-web-driver-with-http-get.ts   did:web resolution via HttpGetService (cache-sharing)
    ├── fetch-json-from-http-get.ts       Wrap an HttpGetService as a FetchJson
    ├── registry-key-hash.ts              Stable hash of a registry list for cache keys
    ├── json-pointer.ts                   formatJsonPointer (RFC 6901) for ProblemDetail.instance values
    └── jwt-payload-decode.ts             Minimal JWT payload decoder (OIDF handler)
```

```
test/
├── fixtures/                            Golden VC objects for smoke / select integration tests
├── verify-credential.spec.ts            End-to-end credential verification
├── verify-presentation.spec.ts          End-to-end presentation verification
├── verifier-cache-sharing.spec.ts       Pins the perf claim: one Verifier shares caches across calls
├── smoke.spec.ts                        Networked interop regression (npm run test:smoke)
├── run-suites.spec.ts                   Suite orchestration tests
├── types.spec.ts                        Type validation tests
├── schemas.spec.ts                      Zod schema tests
├── factories/
│   ├── data/                            CredentialFactory + helpers for synthesizing test VCs
│   └── services/                        Service test doubles (FakeCryptoService, FakeHttpGetService, …)
│       ├── build-test-context.ts        buildTestContext: assemble a VerificationContext for suite unit tests
│       ├── fake-verifier.ts             Verifier test double (vc-recognition recursion seam)
│       ├── fake-http-get-service.ts     HttpGetService test double; also counts fetches per URL
│       └── …                            other Fake* factories
├── services/registry-handlers/          Handler unit tests + registry-lookup spec
├── suites/                              Suite-by-suite unit tests (default suites only)
├── openbadges/                          OpenBadges submodule unit + integration specs
│   ├── result-ref-check.spec.ts
│   ├── achieved-level-check.spec.ts
│   ├── missing-result-status-check.spec.ts
│   ├── unknown-achievement-type-check.spec.ts
│   ├── openbadges-submodule.spec.ts     Integration spec: package.json#exports resolution, default-path invariant, opt-in path, factory composition
│   └── fixtures/                        TS-module fixtures for the OB integration spec
└── util/                                Util unit tests
```

## Verification pipeline

```
   ┌──────────────────────────────┐
   │    createVerifier(config)    │  builds httpGetService, cacheService, cryptoServices,
   │      (composition root)      │  documentLoader, lookupIssuers — all reused per call
   └──────────────┬───────────────┘
                  │ verifier.verifyCredential(call)
                  ▼
            ┌──────────┐
            │  Parse   │  Zod schema → VerifiableCredential | parse error
            └────┬─────┘
                 │
                 ▼
            ┌──────────────────┐
            │ Internal context │  per-call build merges long-lived deps + per-call inputs
            │  (per call)      │  (registries override, additionalSuites, challenge, …)
            └────┬─────────────┘
                 │
                 ▼
            ┌──────────┐
            │  Suites  │  runSuites() → CheckResult[]
            └────┬─────┘  core → recognition → proof → status → registry (+ additionalSuites)
                 │        (phase filter applied first; `applies` predicates gate next)
                 ▼
            ┌──────────┐
            │  Report  │  { verified, verifiableCredential,
            │          │    normalizedVerifiableCredential?, recognizedProfile?,
            │          │    results: CheckResult[], partial? }
            └──────────┘
```

**Compose.** `createVerifier(config)` runs once per `Verifier` instance. It resolves long-lived
dependencies — `httpGetService`, `cacheService`, `cryptoServices`, `documentLoader`, `registries`,
per-type `registryHandlers` — falling back to internal lazy-memoized factories from
`default-services.ts` when the caller omits them. It then builds a single `lookupIssuers` keyed
to those services, and returns a `Verifier` whose methods share all of the above.

**Parse.** Zod schemas (`schemas/credential.ts`) validate the input. A parse failure produces a
synthetic `parsing.envelope` check result with a `ProblemDetail` describing what went wrong.
The credential is `unknown` on entry — callers don't need to pre-validate.

**Context.** Each `verifyCredential` / `verifyPresentation` call builds an internal
`VerificationContext` from the verifier's long-lived services plus per-call inputs (the parsed
credential or presentation, optional `additionalSuites`, optional `registries` override, optional
`challenge` / `unsignedPresentation` for VPs). The context is the seam the suites consume; it is
not a public composition point. Because `documentLoader` and `cacheService` live on the verifier,
they're shared across every call on the same instance — this is what makes batch verification
reuse fetches.

**Suites.** `runSuites()` in `run-suites.ts` iterates suites in order, running each check
sequentially. The default suite order is: **core → recognition → proof → status → registry**.
Each suite carries a `phase` tag (`'cryptographic' | 'trust' | 'recognition' | 'semantic'`)
that drives the optional phase filter (see [Phases and two-pass
verification](#phases-and-two-pass-verification)) and may declare an `applies` predicate that
gates execution against the current subject (see [The `applies` predicate](#the-applies-predicate)).
Callers can append custom suites via `additionalSuites`. Open Badges 3.0 verification ships in
the opt-in `/openbadges` submodule (see
[Vertical submodules](#vertical-submodules-openbadges-and-beyond)).

**Report.** The result is a `CredentialVerificationResult`: a `verified` boolean (true if no
fatal failures) plus a flat `CheckResult[]` array. Every check that ran (or was skipped) appears
in the array, so the report is always complete.

### Presentation flow

`verifyPresentation` follows the same pipeline with two additions:

1. The VP itself is verified for its signature (proof suite with presentation-specific proof purpose).
2. Each embedded credential is extracted (`extractCredentialsFrom`) and verified individually by
   recursing into the **same `Verifier` instance** (`this.verifyCredential(...)`), so the cache,
   document loader, crypto services, and registries are automatically shared across every embedded
   VC.

The result is a `PresentationVerificationResult` with `verifiablePresentation` (the parsed VP),
`presentationResults` (VP-level check results), and `credentialResults` (one
`CredentialVerificationResult` per embedded VC). The `flattenPresentationResults` helper in
`src/flatten-presentation-results.ts` returns a single provenance-tagged
`FlattenedCheckResult[]` view when callers want to iterate every check that ran without losing
which credential a check came from.

## The Verifier factory

`createVerifier(config)` returns a `Verifier` with two methods. The split between configuration
and per-call inputs is the core of the design:

| Lives on the verifier (`VerifierConfig`)         | Per call (`VerifyCredentialCall` / `VerifyPresentationCall`)              |
|--------------------------------------------------|---------------------------------------------------------------------------|
| `httpGetService`, `cacheService`, `cryptoServices` | `credential` (or `presentation`)                                        |
| `documentLoader`, `registries`, `registryHandlers` | `additionalSuites`, `registries` (per-call override), `challenge`, `unsignedPresentation` |

Hold a `Verifier` whenever you'll perform more than one verification. The cache reuse covers
issuer DID documents (via the `CachedResolver` baked into the document loader), DCC-legacy
registry payloads, OIDF entity statements, and any data the registry handlers store under
`cacheService`.

The `cryptoServices` passed to `createVerifier` is the complete and only set governing proof
verification — for presentations, for credentials, and for the BitstringStatusListCredentials
fetched during a status check.

Each `createVerifier()` without an explicit `cacheService` gets a fresh `InMemoryCacheService`. The default cache is no longer process-wide; two verifiers built from defaults isolate their cache contents. The default `BuiltinHttpGetService` is still memoized because the adapter itself is stateless, and the default crypto stack and document loader are also memoized for the same reason — only the cache, which holds caller-visible mutable state, is per-instance by default. To deliberately share cache state across verifiers, construct one `InMemoryCacheService` (or any `CacheService` adapter) and pass it as `createVerifier({ cacheService })` to each.

#### Default document loader routing

`defaultDocumentLoaderFor(httpGetService)` always builds the JSON-LD
document loader via `documentLoaderFromHttpGet(httpGetService)` — the
same path used when callers pass their own `httpGetService`. Every
remote fetch (JSON-LD contexts, `did:web` documents, status list
credentials) therefore flows through the verifier's HTTP service,
giving caller-installed mocks, retries, and (future) caches a single
chokepoint to observe.

To avoid re-allocating the loader's `CachedResolver` and DID drivers
on every call, the per-service loader is memoized via a module-local
`WeakMap<HttpGetService, DocumentLoader>`. The default service is
itself memoized, so its loader persists for the process; caller
services map to one loader each, GC'd when the caller drops the
service. The standalone `verifyCredential` / `verifyPresentation`
wrappers (which build a fresh verifier per call) reuse the same
loader for the default service via this map.

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';

const verifier = createVerifier({ registries: myRegistries });
for (const credential of batch) {
  const result = await verifier.verifyCredential({ credential });
  // ... handle ...
}
```

### Recursion through the verifier

The `vc-recognition` registry handler needs to recursively verify the recognition credential it
fetches — and it must do so through the *same* `Verifier` so the recursive call shares caches.
That creates a chicken-and-egg between `createVerifier` (which needs `lookupIssuers` to build
its context) and `createRegistryLookup` (which wants the verifier to thread into handlers).

The fix: `createVerifier` forward-declares the verifier reference, then passes
`createRegistryLookup` a `getVerifier` thunk that closes over a mutable slot. After the verifier
object is built, the slot is filled. Handlers receive the verifier through
`RegistryHandlerContext`, and `vc-recognition` passes `registries: []` to its recursive
`verifier.verifyCredential(...)` as a recursion guard. Status-list credential proofs do **not**
take this path: they go through `dispatchProofVerification` against `cryptoServices` (see the
status suite) rather than a recursive `Verifier.verifyCredential` call.

## Suites and checks

A **suite** is a named, ordered collection of **checks**. A **check** is an async function that
receives a `VerificationSubject` and `VerificationContext` and returns a `CheckOutcome`.

```
VerificationCheck.execute(subject, context)
       │
       ▼
CheckOutcome
  ├── { status: 'success', message }
  ├── { status: 'failure', problems: ProblemDetail[] }
  └── { status: 'skipped', reason }
       │
       ▼
CheckResult: { suite, check, outcome, fatal?, timing? }
```

`timing` is opt-in: present on every `CheckResult`,
`SuiteSummary`, and top-level result only when the producing
call ran with `timing: true`. Additive — no consumer reads
break when the flag is left at its default (`false`). See
[`docs/api/timing.md`](./api/timing.md).

### Key behaviors

- **`appliesTo`** limits a check to credential-only or presentation-only subjects. If unset, the
  check runs for both.
- **`fatal`** on a check means a failure stops remaining checks *in that suite only*. Later suites
  still run. This ensures the report is always complete.
- **Failures** carry `ProblemDetail[]` — RFC 9457-inspired structured errors with `type` (URI),
  `title`, and `detail`.
- **Skips** carry a `reason` string explaining why (e.g. "Credential has no credentialStatus").

### Default suites

| Suite              | ID            | Phase           | Checks                                                                         | Fatal | Purpose                                                          |
|--------------------|---------------|-----------------|--------------------------------------------------------------------------------|-------|------------------------------------------------------------------|
| Core Structure     | `core`        | `cryptographic` | `core.context-exists`, `core.vc-context`, `core.credential-id`, `core.proof-exists` | Yes  | Validates basic VC structure before crypto                       |
| Recognition        | `recognition` | `recognition`   | `recognition.profile`                                                          | No    | Pluggable recognizer dispatch; produces normalized credential form. No-op when no recognizers configured. |
| Proof Verification | `proof`       | `cryptographic` | `proof.signature`                                                              | Yes   | Cryptographic signature verification dispatched via `CryptoService`. Does **not** check credential status — see the status suite. |
| Credential Status  | `status`      | `cryptographic` | `status.bitstring`                                                             | Yes   | Revocation/suspension via BitstringStatusList. **Sole owner** of status verification: a missing/invalid/expired status list, a wrong-typed list, or a flipped revocation/suspension bit all fail the credential. The status list credential's own proof is verified through the injected `CryptoService`s, same dispatch as any other credential. |
| Issuer Registry    | `registry`    | `trust`         | `registry.issuer`                                                              | No    | Lookup issuer DID in known registries via `context.lookupIssuers` |

Open Badges 3.0 verification (semantic checks and JSON Schema conformance) is no
longer in the default list; it ships as an opt-in submodule
(see [Vertical submodules](#vertical-submodules-openbadges-and-beyond)). The OB
suite bundles are tagged `phase: 'semantic'`.

### Phases and two-pass verification

Every built-in suite carries a `phase` tag drawn from
`SuitePhase = 'cryptographic' | 'trust' | 'recognition' | 'semantic'`. The phase
is consumed by the optional `phases?: SuitePhase[]` filter on `VerifierConfig`
(or per-call on `VerifyCredentialCall` / `VerifyPresentationCall`):

- **No `phases:`** — every suite runs (default behavior; the phase tag is
  effectively ignored). `partial` is unset on the result.
- **`phases:` provided** — only suites whose `phase` is in the list run.
  Suites without a `phase` tag bypass the filter and always run, so a custom
  suite that omits `phase` cannot be accidentally skipped by a phase request.
  All built-in suites are explicitly tagged.
- **Auto-include rule** — requesting `'semantic'` automatically adds
  `'recognition'` to the effective phase set so semantic suites can consume the
  normalized credential form.
- **`partial: true`** is set on `CredentialVerificationResult` and
  `PresentationVerificationResult` whenever the consumer passed an explicit
  `phases:` value. Downstream code can use this flag to recognize that the
  result intentionally covers only a subset of the pipeline.

The two-pass workflow this enables: run a full pipeline once
(`verifyPresentation` with no phase filter) to perform cryptographic + trust +
recognition + semantic checks; then later, when the consumer wants to re-run
deeper semantic analysis (e.g. re-deriving a UI summary from a normalized
credential), call `verifyCredential` with `phases: ['semantic']` to skip the
crypto and trust passes while still receiving a normalized form. The union of a
crypto-and-trust pass and a semantic pass is equivalent to a single full pass.

Phase filtering happens **before** the `applies` predicate, and a phase-excluded
suite is invisible — it does not emit a synthetic skipped result even when
explicitly queued via `additionalSuites`.

### Recognition pipeline

The `recognition` suite (id `recognition`, phase `recognition`) runs a single
check, `recognition.profile`, that iterates each `RecognizerSpec` configured on
`VerifierConfig.recognizers` in registration order. The first recognizer whose
`applies(subject)` returns true wins; subsequent recognizers are not consulted.

A `RecognizerSpec` declares:

```ts
interface RecognizerSpec {
  id: string;                                  // e.g. 'obv3p0.openbadge'
  name: string;                                // human-readable
  applies: (subject: VerificationSubject) => boolean;
  parse: (credential: unknown) => RecognitionResult;
}

type RecognitionResult =
  | { status: 'recognized'; profile: string; normalized: unknown }
  | { status: 'malformed'; profile: string; problems: ProblemDetail[] };
```

The check returns success on `'recognized'` and failure on `'malformed'`. On
success, the normalized credential and profile id flow through a side channel
on the check payload so `verifier.ts` can lift them onto
`CredentialVerificationResult.normalizedVerifiableCredential` and
`CredentialVerificationResult.recognizedProfile`. Consumers narrow on
`recognizedProfile` to access a typed view of the normalized credential.

When no recognizers are configured the suite is a no-op (the `applies` check
short-circuits) and contributes nothing to `results`. The `recognition` suite
is in `defaultSuites` so OB recognition only requires passing recognizers via
`VerifierConfig.recognizers` — there is no separate suite to wire in.

Open Badges 3.0 ships two recognizers: `obv3p0Recognizer` (for
`OpenBadgeCredential` / `AchievementCredential`) and
`obv3p0EndorsementRecognizer` (for `EndorsementCredential`). They have mutually
exclusive `applies` predicates so configuring both is safe.

### The `applies` predicate

A `VerificationSuite` may declare an `applies(subject, context)` predicate that
the orchestrator consults after the phase filter. Behavior:

- **Implicit (default suite list):** `applies` returning false silently skips
  the suite — no entries appear in `results`.
- **Explicit (suite passed via `additionalSuites`):** `applies` returning false
  emits a single synthetic `<suite-id>.applies` `'skipped'` `CheckResult` so
  the consumer sees their explicit request was acknowledged but not actionable.

This is what lets a consumer queue `openBadgesSuite` against any credential
type and still receive a clean signal in the result when the credential isn't
an Open Badge — without the OB checks running and producing noise.

### `ProblemDetail.instance` (RFC 9457 + RFC 6901)

`ProblemDetail` carries an optional `instance` field aligned with
[RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457). Failure-outcome
problems from semantic and envelope checks populate `instance` with an
[RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901)
identifying the offending portion of the credential — built via the
`formatJsonPointer` helper in `src/util/json-pointer.ts`.

All four refactored OB semantic checks (`OB_INVALID_RESULT_REFERENCE`,
`OB_INVALID_ACHIEVED_LEVEL`, `OB_MISSING_RESULT_STATUS`,
`OB_UNKNOWN_ACHIEVEMENT_TYPE`) emit JSON Pointers (e.g.
`/credentialSubject/result/0/resultDescription`). The strict OB envelope
schemas convert each `ZodIssue.path` into a JSON Pointer via the shared
`zodErrorToProblems` helper in `src/openbadges/schemas/fields-v3p0.ts`, so
malformed-envelope problems are also pinpointed to the failing field.

### Adding a custom suite

```typescript
import { createVerifier, VerificationSuite } from '@digitalcredentials/verifier-core';

const myCustomSuite: VerificationSuite = {
  id: 'custom',
  name: 'My Custom Checks',
  checks: [{
    id: 'custom.my-check',
    name: 'My Check',
    fatal: false,
    execute: async (subject, context) => {
      // ... your logic ...
      return { status: 'success', message: 'Check passed.' };
    },
  }],
};

const verifier = createVerifier();
const result = await verifier.verifyCredential({
  credential,
  additionalSuites: [myCustomSuite],
});
```

## Vertical submodules (OpenBadges, and beyond)

Some verification logic only matters to a subset of credential consumers. Rather
than ship that logic in the default suite list — and pay its cost on every
verification — the library exposes it as an **opt-in submodule** under a
dedicated `package.json#exports` subpath. The first such submodule is
`@digitalcredentials/verifier-core/openbadges`.

A vertical submodule has three properties:

1. **It is not part of `defaultSuites`.** Consumers wire it in explicitly via
   `additionalSuites` on a verify call. Verifiers that don't import the submodule
   pay zero cost for its checks.
2. **It owns its own problem-type catalog.** OB-specific URIs live in
   `src/openbadges/problem-types.ts` (re-exported from the submodule barrel as
   both `OpenBadgesProblemTypes` and `Obv3ProblemTypes`). The core
   `src/problem-types.ts` no longer mirrors these entries; consumers branching
   on OB problems import the submodule's catalog directly.
3. **It may share recognition helpers with the core suites.** The AJV-backed
   `obv3SchemaCheck` in `src/suites/schema/obv3/` consumes
   `isOpenBadgeCredential` / `isEndorsementCredential` from
   `src/openbadges/recognize.ts`. The directional dependency is
   `suites/schema/obv3/` → `openbadges/`, never the reverse — the submodule
   stays free to depend on whatever it needs from the rest of `src/` without
   creating a cycle.

The `/openbadges` submodule exports three suite bundles
(`openBadgesSuite`, `openBadgesSemanticSuite`, `openBadgesSchemaSuite` — all
tagged `phase: 'semantic'` and gated by an `applies` predicate that returns
true only for OB credentials), individual checks, a factory for
caller-augmented vocabulary (`createObv3UnknownAchievementTypeCheck`),
recognition helpers, two `RecognizerSpec`s (`obv3p0Recognizer`,
`obv3p0EndorsementRecognizer`) plus their strict envelope Zod schemas
(`Obv3p0OpenBadgeCredentialSchema`, `Obv3p0EndorsementCredentialSchema`,
along with their `parseObv3p0…` entry points), the OB-specific problem-type
catalog, and version-scoped `AchievementType` vocabulary
(`OB_3_0_ACHIEVEMENT_TYPES`, the moving `KNOWN_ACHIEVEMENT_TYPES` alias, and the
spec-sanctioned `ACHIEVEMENT_TYPE_EXT_PREFIX = 'ext:'`). The schemas are
version-pinned to OB 3.0 so a future OB 3.1 schema can be introduced
side-by-side with its own recognizer rather than mutating the 3.0 shape. See
the README's
[Open Badges 3.0 verification](../README.md#open-badges-30-verification-opt-in-submodule)
and
[Credential recognition + two-pass verification](../README.md#credential-recognition--two-pass-verification)
sections for the consumer-facing API.

Future verticals (e.g. EU DCC, jurisdiction-specific trust frameworks, or
issuer-specific extensions) follow the same pattern: a directory under
`src/<vertical>/`, a `package.json#exports` entry (`./<vertical>`), one or more
suite bundles in the curated barrel, and an opt-in admission via
`additionalSuites`. The default verifier surface stays small; consumers compose
the verticals they actually need.

## Type system

How the public types connect:

```
VerifierConfig                       (long-lived deps: http, cache, crypto, registries, handlers, loader)
  → createVerifier()
    → Verifier
      → verifyCredential(VerifyCredentialCall)         (per-call: credential, additionalSuites, registries override)
        → internal VerificationContext                  (built per call, not exposed)
          → VerificationSubject ({ verifiableCredential })
          → VerificationSuite[]
            → VerificationCheck.execute(subject, context)
              → CheckOutcome (success | failure | skip)
                → CheckResult (suite, check, outcome, fatal?, timing?)
        → CredentialVerificationResult                  ({ verified, verifiableCredential, results })
```

`verifyPresentation(VerifyPresentationCall)` follows the same shape, returning a
`PresentationVerificationResult`. Standalone `verifyCredential(opts)` /
`verifyPresentation(opts)` accept `VerifyCredentialOptions` / `VerifyPresentationOptions`, which
are simple type aliases for `VerifierConfig & VerifyXCall`.

**`ProblemDetail`** is the structured error shape, inspired by RFC 9457 but without `status`
(this is not an HTTP context). Every failure carries one or more `ProblemDetail` entries with a
`type` URI, `title`, and `detail`. An optional `instance` field carries an RFC 6901 JSON
Pointer locating the offending portion of the credential — see
[`ProblemDetail.instance`](#problemdetailinstance-rfc-9457--rfc-6901).

**`EntityIdentityRegistry`** is a discriminated union (`oidf` | `dcc-legacy` | `vc-recognition`)
configuring which issuer registries to check. The `oidf` variant uses OpenID Federation trust
anchors; `dcc-legacy` uses the older URL-based DCC registry format; `vc-recognition` consumes a
recognition VC issued by a trust authority.

## Result models

`verifyCredential` returns a `CredentialVerificationResult`:

```ts
{
  verified: boolean;
  verifiableCredential: VerifiableCredential;
  results: CheckResult[];
  summary: SuiteSummary[];                   // per-suite rollup (since v2.0.0)
  normalizedVerifiableCredential?: unknown;  // populated when a recognizer matched
  recognizedProfile?: string;                // recognizer id (e.g. 'obv3p0.openbadge')
  partial?: boolean;                         // true when caller passed `phases:`
}
```

`verifyPresentation` returns a `PresentationVerificationResult`:

```ts
{
  verified: boolean;
  verifiablePresentation: VerifiablePresentation;
  presentationResults: CheckResult[];
  credentialResults: CredentialVerificationResult[];
  summary: SuiteSummary[];
  partial?: boolean;
}
```

### Result folding

Since v2.0.0, `results[]` (on both result types, and on each embedded `credentialResults[i]`)
carries only failures and explicit `<suite>.applies` skips by default; the per-suite rollup lives in
`summary[]`. Pass `verbose: true` (on the verifier or per call) to restore the legacy "every check"
shape on `results[]`. The folding itself is implemented as a pure helper — `foldCheckResults` /
`computeId` in `src/fold-results.ts` — and is also exported from the package barrel for consumers
that append late results and want to re-fold.

See [`docs/api/verification-results.md`](api/verification-results.md) for the full reference,
including the `id` namespace, rendering recipes, and the LLM prompt appendix for downstream UIs.

Both shapes use the suite-based `CheckResult[]` model. Each `CheckResult` carries a discriminated
`CheckOutcome` (`success | failure | skipped`) plus provenance (suite, check id, fatal flag) and,
optionally, a `timing: TaskTiming` populated when the producing call ran with `timing: true`. The
result objects are intentionally lean — no top-level flattened aggregate, no denormalized lists —
so they remain cheap to persist (e.g. into Redis as part of a long-lived exchange) and to transit
over the wire. Field names mirror the wire-level VC/VP property names so the result can be spread
directly into a downstream variables object whose templates resolve properties by path.

When a single iterable view of every check is convenient, `flattenPresentationResults(result)`
returns a `FlattenedCheckResult[]` that tags each entry with its provenance
(`'presentation'` or `{ source: 'credential', credentialIndex }`) — see the README for an example.

### Problem-type catalog

`src/problem-types.ts` exports a flat const map of every built-in `ProblemDetail.type` URI plus a
derived `ProblemType` union. The map deliberately mixes two provenance categories: a small number
of W3C VC Data Model 2.0 §7.1 Verification error identifiers (currently only `PARSING_ERROR`) and
a larger number of synthesized placeholders that share the same
`https://www.w3.org/TR/vc-data-model#…` prefix as a stable opaque key but are not defined by the
spec. Each entry has per-token JSDoc calling out its provenance.

Vertical / opt-in problem catalogs live next to their owning vertical and are
re-exported from that vertical's submodule barrel — they are **not** mirrored
into the core `ProblemTypes` map. The first such catalog is
`OpenBadgesProblemTypes` (also exported as `Obv3ProblemTypes`) in
`src/openbadges/problem-types.ts`, surfaced via
`@digitalcredentials/verifier-core/openbadges`. Current OB entries:
`OB_INVALID_RESULT_REFERENCE`, `OB_INVALID_ACHIEVED_LEVEL`,
`OB_MISSING_RESULT_STATUS`, `OB_UNKNOWN_ACHIEVEMENT_TYPE`. The wire URIs use the
`…#OB_*` shape so they remain stable across OB version updates. Failure-outcome
problems from these checks (and from the strict OB envelope schemas) populate
`ProblemDetail.instance` with an RFC 6901 JSON Pointer locating the offending
field.

`ProblemDetail.type` itself stays typed as `string` so callers writing custom suites can emit
their own URIs without requiring an entry in any catalog.

## Dependencies

### Runtime

| Package                                              | Role                                                                |
|------------------------------------------------------|---------------------------------------------------------------------|
| `@digitalcredentials/vc`                             | Core VC/VP signature verification (used inside `DataIntegrityCryptoService`) |
| `@digitalcredentials/jsonld-signatures`              | Linked Data Proof verification and proof purposes                    |
| `@digitalcredentials/ed25519-signature-2020`         | Ed25519Signature2020 crypto suite                                    |
| `@digitalcredentials/eddsa-rdfc-2022-cryptosuite`    | EdDSA/RDFC 2022 Data Integrity crypto suite                          |
| `@interop/ecdsa-signature`                           | ECDSA/RDFC 2019 Data Integrity crypto suite (P-256/P-384 Multikey)   |
| `@interop/ecdsa-multikey`                            | ECDSA Multikey `from` handler for did:key/did:web ECDSA verification methods |
| `@digitalcredentials/data-integrity`                 | DataIntegrityProof wrapper                                           |
| `@digitalcredentials/security-document-loader`       | Bundled JSON-LD context resolution + `CachedResolver`                |
| `@digitalcredentials/did-method-key`, `did-method-web` | DID resolution drivers used by the document loader                  |
| `@digitalcredentials/vc-bitstring-status-list`       | BitstringStatusList status checking                                   |
| `zod`                                                | Input parsing and structural validation                              |
| `ajv` / `ajv-formats`                                | JSON Schema validation for OBv3 schema checks                        |

### Test

Mocha + Chai for tests, c8 for coverage, Karma + Chrome for browser testing.

## Testing

**Runner.** Mocha with Chai assertions, compiled via `tsconfig.test.json` into `dist/test/`.
Run with `npm test` (lint + coverage via c8). Browser tests available via `npm run test-karma`.

**Structure.** Top-level specs test the public API end-to-end (`verify-credential.spec.ts`,
`verify-presentation.spec.ts`, `verifier-cache-sharing.spec.ts`). Suite-focused specs in
`test/suites/` test individual checks in isolation against a hand-built context via
`buildTestContext` (test-only helper at `test/factories/services/build-test-context.ts`).

**Fixtures.** `test/fixtures/` holds curated golden credentials for `smoke.spec.ts` and a few
integration cases. Suite tests use composable factories under `test/factories/` with fake crypto
and loaders so the default unit run stays offline.

## Architectural direction

The codebase is built around a [hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/)
(ports and adapters). The goal is a library that is environment-agnostic, thoroughly testable
without network dependencies, and composable — consumers wire in exactly the behavior they need.

### What's already hexagonal

- **`createVerifier(...)` is the composition root.** All concrete adapters
  (`HttpGetService`, `CacheService`, `CryptoService[]`, `DocumentLoader`, `RegistryHandlerMap`,
  `TimeService`)
  are injectable on `VerifierConfig`; defaults live in internal lazy factories
  (`default-services.ts`) and are not exported.
- **`TimeService` is the clock seam.** Wall-clock and monotonic time both flow through
  `VerificationContext.timeService` (default `RealTimeService`). The orchestrator
  (`runSuites`) uses it to populate `TaskTiming` when `timing: true`; checks may use it
  for any time-sensitive decision (credential expiration, signature clock-skew window,
  key rotation, status-list freshness). Tests pass `FakeTimeService` for deterministic
  exact-value assertions on every `TaskTiming` field.
- **Suites are plugins** with a uniform `VerificationCheck` interface. Adding a new check or suite
  requires no changes to the core orchestration; callers append via `additionalSuites`.
- **`VerificationContext` carries injected services** (document loader, crypto services, cache,
  registries, `lookupIssuers`). Built per call by the verifier; not a public composition point.
- **`CheckOutcome` is a clean discriminated union** (success | failure | skip) — no exceptions for
  verification failures.
- **`lookupIssuers` is built per-`Verifier`** and threaded into handlers via
  `RegistryHandlerContext`, including the verifier itself (via a thunk) so `vc-recognition` can
  recursively verify the recognition VC through the same instance with a `registries: []`
  recursion guard.
- **`RegistryHandler` is a port.** Callers can override or extend the per-type handler map by
  passing `registryHandlers` on `VerifierConfig`.
- **No dynamic imports in `src/`.** The proof suite is statically wired; recursion through the
  verifier replaced the old dynamic-import seam from `vc-recognition-handler` into `verify-suite`.

### What's not yet hexagonal

- **Proof suite** dispatches via `CryptoService.canVerify(...)` (a port), but the default
  implementation embeds `@digitalcredentials/vc` directly inside `DataIntegrityCryptoService`.
  Replacing the default crypto service requires understanding the LD-Proofs / Data Integrity
  internals. The default crypto service verifies signatures only — credential status checking
  is the sole responsibility of the status suite (P-E, 2026-04-19).
- **Status suite** still consumes `@digitalcredentials/vc-bitstring-status-list` for purpose
  matching, validity dates, bitstring decoding, and index reading. The status list credential's
  proof is verified through the injected `CryptoService`s via `src/crypto-dispatch.ts` — the
  same dispatch presentations and credentials use. Recursively calling `Verifier.verifyCredential`
  on the status list credential is deferred (it needs a recursion guard the status suite cannot
  currently express without a suite-suppression API).
- **Registry handlers** (`dcc-legacy`, `oidf`, `vc-recognition`) consume third-party clients and
  parsing libraries inline rather than through narrower ports — though they do share the verifier's
  `httpGetService` and `cacheService`, so caching and HTTP behavior are uniform.
- **OBv3 schema check** uses AJV directly. A `JsonSchemaValidator` port would let consumers swap
  in a different validator or share a single validator across calls. (The check itself was
  already lifted into the opt-in `/openbadges` submodule's `openBadgesSchemaSuite` bundle, so
  consumers who don't care about Open Badges already pay zero cost for it.)
- **No `Clock` port.** TTL math reads from `new Date()` / `Date.now()` directly, which makes
  time-dependent behavior awkward to test.

### Direction

With `HttpGetService`, `CacheService`, `CryptoService`, and `RegistryHandler` ports in place,
the remaining hexagonal work is:

1. Wrap AJV behind a `JsonSchemaValidator` port. (The "lift the OBv3 schema check into a
   separate vertical" half of this item is done — see the `/openbadges` submodule.)
2. Introduce a `Clock` port for testable TTL behavior.

This is a direction, not a mandate. Progress is incremental — each change that moves a concrete
dependency behind an interface moves the library closer to the target architecture.
