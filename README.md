# verifier-core _(@digitalcredentials/verifier-core)_

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/verifier-core/ci.yml?branch=main)](https://github.com/digitalcredentials/verifier-core/actions?query=workflow%3ACI)

> Verifies W3C Verifiable Credentials in the browser, Node.js, and React Native.

## Table of Contents

- [Overview](#overview)
- [API](#api)
  - [verifyCredential](#verifycredential)
  - [verifyPresentation](#verifypresentation)
  - [createVerifier (batch / repeated verification)](#createverifier-batch--repeated-verification)
- [Custom Suites](#custom-suites)
- [Verbose mode and folded summaries](#verbose-mode-and-folded-summaries)
- [Capturing timing data](#capturing-timing-data)
- [Pluggable clock (TimeService)](#pluggable-clock-timeservice)
- [Open Badges 3.0 verification (opt-in submodule)](#open-badges-30-verification-opt-in-submodule)
- [Credential recognition + two-pass verification](#credential-recognition--two-pass-verification)
- [Architecture](#architecture)
- [Migration from earlier 1.0.0-beta.x](#migration-from-earlier-100-betax)
- [Install](#install)
- [Contribute](#contribute)
- [License](#license)

## Overview

Verifies the following versions of W3C Verifiable Credentials:

- [1.0](https://www.w3.org/TR/2019/REC-vc-data-model-20191119/)
- [1.1](https://www.w3.org/TR/2022/REC-vc-data-model-20220303/)
- [2.0](https://www.w3.org/TR/vc-data-model-2.0/)

Supports the
[eddsa-rdfc-2022](https://github.com/digitalbazaar/eddsa-rdfc-2022-cryptosuite)
and [ecdsa-rdfc-2019](https://www.w3.org/TR/vc-di-ecdsa/) (P-256/P-384 Multikey)
Data Integrity Proof cryptosuites, and the
[ed25519-signature-2020 Linked Data Proof](https://github.com/digitalbazaar/ed25519-signature-2020)
cryptosuite.

Verification runs an ordered pipeline of **suites**, each containing one or more
**checks**:

| Suite           | Phase           | What it checks                                                                                                                                                  | Fatal? |
| --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Core**        | `cryptographic` | `@context` exists, VC context URI present, resolve issuers, credential ID valid, proof exists                                                                   | Yes    |
| **Recognition** | `recognition`   | Pluggable credential-profile recognition; produces a normalized credential form (no-op when no recognizers configured)                                          | No     |
| **Proof**       | `cryptographic` | Cryptographic signature verification                                                                                                                            | Yes    |
| **Status**      | `cryptographic` | Revocation/suspension via BitstringStatusList — sole owner of status verification. The list credential's proof is checked with the configured `cryptoServices`. | Yes    |
| **Registry**    | `trust`         | Issuer DID lookup in known trust registries                                                                                                                     | No     |

The **Phase** column drives the optional `phases:` filter on `VerifierConfig`
and per-call args, used for
[two-pass verification](#credential-recognition--two-pass-verification).

Open Badges 3.0 verification lives in the opt-in submodule
[`@digitalcredentials/verifier-core/openbadges`](#open-badges-30-verification-opt-in-submodule)
and is not part of the default suite list.

The result doesn't make a single "valid/invalid" judgment. It returns the
outcome of every check, letting consumers decide what matters for their use
case. A credential with a revoked status will fail (`verified: false`) — that's
an issuer-asserted state we can't ignore — but other distinctions, like an
unregistered issuer (the registry might just not be up to date), are surfaced as
non-fatal results for the consumer to weigh.

### Trust Registries

Registry checks look up the credential's issuer DID in known registries. The DCC
publishes a list of known registries:

```
https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json
```

Fetch and pass it to verification:

```typescript
const response = await fetch(
  'https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json'
);
const registries = await response.json();

const result = await verifyCredential({ credential, registries });
```

> [!CAUTION] The DCC registry list does not make claims about the registries it
> contains. It is a list of registries that the DCC knows about — it says
> nothing about the quality, meaning, or value of credentials issued by anyone
> in those registries.

## API

### verifyCredential

```typescript
import { verifyCredential } from '@digitalcredentials/verifier-core';

const result = await verifyCredential({
  credential, // The VC to verify (any version, passed as unknown)
  registries // Optional: issuer trust registries
});
```

#### Options

```typescript
interface VerifyCredentialOptions {
  credential: unknown;
  registries?: EntityIdentityRegistry[];
  additionalSuites?: VerificationSuite[];

  // Service overrides (otherwise sensible defaults are used):
  httpGetService?: HttpGetService;
  cacheService?: CacheService;
  cryptoServices?: CryptoService[];
  registryHandlers?: RegistryHandlerMap;
  documentLoader?: DocumentLoader;
}
```

Only `credential` is required. All other fields override sensible defaults
(security-document-loader, Ed25519 + EdDSA + ECDSA crypto suites, in-memory
cache). The configured `cryptoServices` verify presentation proofs, credential
proofs, and the proofs on BitstringStatusListCredentials fetched during a status
check. `VerifyCredentialOptions` is the type alias
`VerifierConfig & VerifyCredentialCall`, so callers building the options object
piece-by-piece can compose against either half.

#### Result

```typescript
interface CredentialVerificationResult {
  verified: boolean;
  verifiableCredential: VerifiableCredential;
  results: CheckResult[];
  summary: SuiteSummary[];
}
```

`verified` is `true` when no check returned a failure. By default (since v2.0.0)
`results` carries only failures and explicit `<suite>.applies` skips, while
`summary` provides the per-suite rollup (see
[Verbose mode and folded summaries](#verbose-mode-and-folded-summaries)). Pass
`verbose: true` to receive every check that ran in `results`.

Each `CheckResult` contains a discriminated `CheckOutcome`:

```typescript
type CheckOutcome =
  | { status: 'success'; message: string }
  | { status: 'failure'; problems: ProblemDetail[] }
  | { status: 'skipped'; reason: string };
```

Failures carry one or more `ProblemDetail` entries (inspired by
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)):

```typescript
interface ProblemDetail {
  type: string; // URI identifying the problem
  title: string; // Short human-readable summary
  detail: string; // Specific explanation of this occurrence
}
```

#### Example: Successful verification

```json
{
  "verified": true,
  "verifiableCredential": { "...parsed credential..." },
  "results": [
    { "suite": "core",   "check": "core.context-exists", "outcome": { "status": "success", "message": "Credential has a valid @context property." } },
    { "suite": "core",   "check": "core.vc-context",     "outcome": { "status": "success", "message": "..." } },
    { "suite": "core",   "check": "core.credential-id",  "outcome": { "status": "success", "message": "..." } },
    { "suite": "core",   "check": "core.proof-exists",   "outcome": { "status": "success", "message": "..." } },
    { "suite": "proof",  "check": "proof.signature",     "outcome": { "status": "success", "message": "Signature verified successfully." } },
    { "suite": "status", "check": "status.bitstring",    "outcome": { "status": "success", "message": "Credential status is valid (not revoked or suspended)." } },
    { "suite": "registry", "check": "registry.issuer",   "outcome": { "status": "success", "message": "Issuer found in registry: DCC Sandbox Registry" } }
  ]
}
```

#### Example: Invalid signature (fatal)

An invalid signature is fatal — it means any part of the credential could have
been tampered with, so subsequent checks within the proof suite stop. Other
suites still run.

```json
{
  "verified": false,
  "results": [
    {
      "suite": "core",
      "check": "core.context-exists",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "suite": "core",
      "check": "core.proof-exists",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "suite": "proof",
      "check": "proof.signature",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#INVALID_SIGNATURE",
            "title": "Invalid Signature",
            "detail": "The signature is not valid."
          }
        ]
      }
    },
    {
      "suite": "status",
      "check": "status.bitstring",
      "outcome": { "status": "skipped", "reason": "..." }
    }
  ]
}
```

#### Example: Revoked credential (fatal, sourced from status)

When a credential's status list marks it revoked or suspended — or the verifier
can't confidently evaluate the list (missing, expired, wrong type, signature
invalid) — the status suite fails the credential. The proof check still passes
on its own merits.

```json
{
  "verified": false,
  "results": [
    {
      "suite": "core",
      "check": "core.context-exists",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "suite": "proof",
      "check": "proof.signature",
      "outcome": {
        "status": "success",
        "message": "Signature verified successfully."
      }
    },
    {
      "suite": "status",
      "check": "status.bitstring",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#CREDENTIAL_REVOKED_OR_SUSPENDED",
            "title": "Credential Revoked or Suspended",
            "detail": "The credential has been revoked or suspended according to the status list."
          }
        ]
      }
    }
  ]
}
```

#### Example: Check skipped

Checks skip when they're irrelevant to the input. For instance, a credential
with no `credentialStatus` skips the status check:

```json
{
  "suite": "status",
  "check": "status.bitstring",
  "outcome": {
    "status": "skipped",
    "reason": "Credential has no credentialStatus."
  }
}
```

#### Error taxonomy

All failures use `ProblemDetail` with a `type` URI. Common error types:

| Type URI                              | Title                                                              | When                                   |
| ------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `...#PARSING_ERROR`                   | Invalid JSON-LD / No VC Context / Invalid Credential ID / No Proof | Structural problems                    |
| `...#INVALID_SIGNATURE`               | Invalid Signature                                                  | Signature doesn't match content        |
| `...#DID_WEB_UNRESOLVED`              | DID Web Unresolved                                                 | `did:web` document couldn't be fetched |
| `...#HTTP_ERROR`                      | HTTP Error                                                         | Network error during signature check   |
| `...#CREDENTIAL_REVOKED_OR_SUSPENDED` | Credential Revoked or Suspended                                    | Status list indicates revocation       |
| `...#STATUS_LIST_NOT_FOUND`           | Status List Not Found                                              | Status list URL unreachable            |
| `...#STATUS_LIST_EXPIRED`             | Status List Expired                                                | Status list VC has expired             |
| `...#STATUS_LIST_SIGNATURE_ERROR`     | Status List Signature Error                                        | Status list VC signature invalid       |
| `...#ISSUER_NOT_REGISTERED`           | Issuer Not Registered                                              | Issuer DID not in any registry         |
| `...#REGISTRY_UNCHECKED`              | Registry Unchecked                                                 | Some registries couldn't be reached    |

#### Problem types

Every built-in problem URI is also exported as a constant. Branch on the const
map for type-safe checks:

```typescript
import {
  ProblemTypes,
  type ProblemType
} from '@digitalcredentials/verifier-core';

switch (problem.type as ProblemType) {
  case ProblemTypes.INVALID_SIGNATURE:
    // ...
    break;
  case ProblemTypes.CREDENTIAL_REVOKED_OR_SUSPENDED:
    // ...
    break;
  case ProblemTypes.STATUS_LIST_NOT_FOUND:
    // ...
    break;
  // ...
}
```

`ProblemDetail.type` stays typed as `string` so custom suites can emit their own
problem URIs; the cast above is opt-in for callers that only need to branch on
built-in types. See the per-token JSDoc on `ProblemTypes` for which entries are
W3C-spec error identifiers (currently only `PARSING_ERROR`) and which are
synthesized placeholders we use until a wider problem-type vocabulary is
published.

### verifyPresentation

```typescript
import { verifyPresentation } from '@digitalcredentials/verifier-core';

const result = await verifyPresentation({
  presentation, // The VP to verify
  challenge: 'abc123', // Optional: expected challenge
  unsignedPresentation: false, // Optional: allow unsigned VP
  registries // Optional: issuer trust registries
});
```

#### Options

```typescript
interface VerifyPresentationOptions {
  presentation: unknown;
  challenge?: string | null;
  unsignedPresentation?: boolean;
  registries?: EntityIdentityRegistry[];
  additionalSuites?: VerificationSuite[];

  // Service overrides (otherwise sensible defaults are used):
  httpGetService?: HttpGetService;
  cacheService?: CacheService;
  cryptoServices?: CryptoService[];
  registryHandlers?: RegistryHandlerMap;
  documentLoader?: DocumentLoader;
}
```

Like `VerifyCredentialOptions`, this is the alias
`VerifierConfig & VerifyPresentationCall`. The same `cryptoServices` that verify
the presentation also verify each embedded credential and any status list
credentials those credentials name.

#### Result

```typescript
interface PresentationVerificationResult {
  verified: boolean;
  verifiablePresentation: VerifiablePresentation;
  presentationResults: CheckResult[];
  credentialResults: CredentialVerificationResult[];
  summary: SuiteSummary[];
  // No allResults — use flattenPresentationResults(result)
}
```

`presentationResults` and each embedded `credentialResults[i].results` follow
the same folded-by-default shape as `verifyCredential`'s `results`. The
top-level `summary` rolls up the VP envelope's own suites; per-credential
rollups live on `credentialResults[i].summary`.

Presentation verification does two things:

1. **Verifies the VP itself** — checks the presentation's signature (or skips if
   `unsignedPresentation: true`). Results go in `presentationResults`.
2. **Verifies each embedded credential** — extracts credentials from the VP and
   runs `verifyCredential` on each. Results go in `credentialResults`.

`verified` is `true` only if both the presentation and all embedded credentials
pass.

The parsed VP is returned as `verifiablePresentation`, mirroring the wire-level
property name so callers (and downstream systems whose templates reach into
result objects by property path) can reach it without carrying the original
input separately.

A VP needn't be signed — it can simply package credentials together. Set
`unsignedPresentation: true` to skip the VP signature check.

#### Flattening results

When you want a single iterable view of every check that ran across the
presentation and its embedded credentials, use `flattenPresentationResults`:

```typescript
import { flattenPresentationResults } from '@digitalcredentials/verifier-core';

const result = await verifyPresentation({ presentation });
for (const entry of flattenPresentationResults(result)) {
  if (entry.source === 'presentation') {
    // entry.result is a CheckResult from VP-level verification
  } else {
    // entry.source === 'credential'
    // entry.credentialIndex is the index into result.credentialResults
    // entry.result is a CheckResult from that embedded VC
  }
}
```

Each entry preserves provenance — you always know whether a check applied to the
presentation itself or to a specific embedded credential, by index.

### createVerifier (batch / repeated verification)

`verifyCredential` and `verifyPresentation` are convenient one-shot wrappers —
each call builds a fresh verifier internally. When you'll perform more than one
verification, construct a `Verifier` with `createVerifier(...)` and reuse it for
better performance. The instance owns long-lived dependencies (HTTP, cache,
crypto services, document loader, registries), so issuer DID documents, status
list credentials, and JSON-LD contexts are fetched once and reused across calls.

Each verifier owns its own `InMemoryCacheService` by default; cache contents are
isolated from other verifiers in the same process. To share cache state across
verifiers, construct one cache adapter and pass it to each
`createVerifier({ cacheService })`.

The `cryptoServices` passed to `createVerifier` are the complete and only set
that governs proof verification — for presentations, credentials, and the
BitstringStatusListCredentials fetched during a status check.

```typescript
import { createVerifier } from '@digitalcredentials/verifier-core';

const verifier = createVerifier({ registries });

for (const credential of batch) {
  const result = await verifier.verifyCredential({ credential });
  // ... handle result ...
}
```

The same `Verifier` is also used recursively when verifying a presentation, so
all credentials embedded in a VP share the verifier's caches automatically:

```typescript
const result = await verifier.verifyPresentation({ presentation });
```

## Custom Suites

Extend the default pipeline with custom verification logic:

```typescript
import {
  verifyCredential,
  VerificationSuite
} from '@digitalcredentials/verifier-core';

const myCustomSuite: VerificationSuite = {
  id: 'custom.expiry-policy',
  name: 'Expiry Policy',
  checks: [
    {
      id: 'custom.expiry-policy.grace-period',
      name: 'Grace Period Check',
      fatal: false,
      execute: async (subject, context) => {
        const credential = subject.verifiableCredential as any;
        // Custom logic: allow 30-day grace period after expiration
        return { status: 'success', message: 'Within grace period.' };
      }
    }
  ]
};

const result = await verifyCredential({
  credential,
  additionalSuites: [myCustomSuite]
});

// result.results includes checks from both default and custom suites
```

Custom suites run after the default suites. Each check receives the same
`VerificationSubject` and `VerificationContext` as built-in checks.

## Verbose mode and folded summaries

Each `CredentialVerificationResult` and `PresentationVerificationResult` carries
a `summary: SuiteSummary[]` rollup of per-suite outcomes. By default (since
v2.0.0), `results[]` carries only failures and explicit `<suite>.applies` skips;
pass `verbose: true` to keep every check in `results[]`.

```ts
const result = await verifier.verifyCredential({ credential });
// result.summary[i] = { id, phase, suite, status, verified, message, counts, ... }
// result.results[]  = failures + explicit skips only

const verbose = await verifier.verifyCredential({ credential, verbose: true });
// verbose.results[] carries every check that ran, with .id populated.
```

`verbose` is also accepted on `createVerifier(...)` as an instance default;
per-call values win when both are set.

See [`docs/api/verification-results.md`](./docs/api/verification-results.md) for
the full reference (phase model, `SuiteSummary` fields, `id` namespace, UI
rendering recipe, and a prompt-ready appendix for downstream UIs).

## Capturing timing data

Every result can carry per-check, per-suite, and per-call `TaskTiming` data
(wall-clock `startedAt` / `endedAt` plus a monotonic `durationMs`). Off by
default; opt in via `timing: true` on `createVerifier(...)` or per-call. Mirrors
`verbose`'s plumbing — per-call wins, and `verifyPresentation` propagates the
flag into embedded `verifyCredential` calls so the top-level `result.timing` is
an inclusive wrapper.

```ts
const verifier = createVerifier({ timing: true });
const result = await verifier.verifyCredential({ credential });
console.log(result.timing!.durationMs);
console.log(result.summary[0].timing!.durationMs);
```

In `verbose: false` mode (the default), individual `CheckResult.timing` entries
fold away in `results[]`, but the per-suite `SuiteSummary.timing` survives in
`summary[]` so suite-grain timing is never lost. See
[`docs/api/timing.md`](./docs/api/timing.md) for the full reference, granularity
table, recipes, and a prompt-ready appendix.

## Pluggable clock (`TimeService`)

`verifier-core` reads wall-clock and monotonic time through a small
`TimeService` interface. The default is `RealTimeService` (`Date.now` /
`performance.now`); pass `{ timeService: FakeTimeService() }` on
`createVerifier(...)` in tests to make every `TaskTiming` field
exact-value-assertable. Both factories are exported from the package barrel. The
same abstraction will back upcoming work on credential expiration, signature
clock-skew windows, key rotation, and status-list freshness — see
[`docs/api/timing.md`](./docs/api/timing.md) for the reference.

## Open Badges 3.0 verification (opt-in submodule)

Open Badges 3.0 verification ships in
`@digitalcredentials/verifier-core/openbadges` as an opt-in submodule. It is not
part of the default suite list; consumers that want OB checks pass
`openBadgesSuite` (or one of the bundled variants) via `additionalSuites` on a
verify call.

> [!IMPORTANT] If you were on `1.0.0-beta.x` and relied on `obv3SchemaSuite`
> running by default, you now need to opt in explicitly. The simplest migration
> is to add `openBadgesSuite` to your verify call.

### Enabling OB verification

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';
import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges';

const verifier = createVerifier();
const result = await verifier.verifyCredential({
  credential,
  additionalSuites: [openBadgesSuite]
});
```

### Bundle variants

| Bundle                    | Contents                                                           | Network?                                      |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `openBadgesSuite`         | Semantic checks **and** AJV JSON Schema check (the default bundle) | Yes (schema fetch on first use; cached after) |
| `openBadgesSemanticSuite` | Cross-field semantic checks only                                   | No                                            |
| `openBadgesSchemaSuite`   | AJV JSON Schema check only                                         | Yes                                           |

Pick `openBadgesSemanticSuite` when you want the OB-specific semantic checks
(`OB_INVALID_RESULT_REFERENCE`, `OB_INVALID_ACHIEVED_LEVEL`,
`OB_MISSING_RESULT_STATUS`, `OB_UNKNOWN_ACHIEVEMENT_TYPE`) but cannot afford a
network fetch on the first OB credential of a process.

### Problem types

OB-specific problem URIs live on `OpenBadgesProblemTypes` (also exported as
`Obv3ProblemTypes` for symmetry with internal naming):

```ts
import {
  openBadgesSuite,
  OpenBadgesProblemTypes,
  type OpenBadgesProblemType
} from '@digitalcredentials/verifier-core/openbadges';

// In a result-handling callback...
switch (problem.type as OpenBadgesProblemType) {
  case OpenBadgesProblemTypes.OB_INVALID_RESULT_REFERENCE:
    // ...
    break;
  case OpenBadgesProblemTypes.OB_INVALID_ACHIEVED_LEVEL:
    // ...
    break;
  case OpenBadgesProblemTypes.OB_MISSING_RESULT_STATUS:
    // ...
    break;
  case OpenBadgesProblemTypes.OB_UNKNOWN_ACHIEVEMENT_TYPE:
    // ...
    break;
}
```

The wire URIs follow the `…#OB_*` shape (e.g.
`https://www.w3.org/TR/vc-data-model#OB_INVALID_ACHIEVED_LEVEL`). Callers
upgrading from `1.0.0-beta.x` who literal-matched
`OBV3_INVALID_RESULT_REFERENCE` need to update those literals to
`OB_INVALID_RESULT_REFERENCE` (or — preferred — switch to the
`OpenBadgesProblemTypes` constants).

### Caller-augmented `AchievementType` vocabulary

The default `obv3UnknownAchievementTypeCheck` validates against the OB 3.0
§B.1.1 enumeration plus the spec-sanctioned `ext:` prefix. Issuers that mint
additional vocabulary tokens (without an `ext:` prefix) can compose a custom
check that adds those tokens to the accepted set:

```ts
import {
  openBadgesSemanticSuite,
  createObv3UnknownAchievementTypeCheck
} from '@digitalcredentials/verifier-core/openbadges';

const customCheck = createObv3UnknownAchievementTypeCheck({
  additionalKnownTypes: ['MyOrgInternalAchievementType']
});

const customSuite = {
  ...openBadgesSemanticSuite,
  checks: openBadgesSemanticSuite.checks.map(c =>
    c.id === 'schema.obv3.unknown-achievement-type' ? customCheck : c
  )
};

const result = await verifier.verifyCredential({
  credential,
  additionalSuites: [customSuite]
});
```

For version-pinned behavior, the `OB_3_0_ACHIEVEMENT_TYPES` set is exported
directly so callers can build their own check against an explicit OB version
rather than tracking the moving `KNOWN_ACHIEVEMENT_TYPES` alias.

## Advanced: Credential recognition + two-pass verification

`verifier-core` ships a **pluggable recognition pipeline**. Recognizers (e.g.,
`obv3p0Recognizer`, `obv3p0EndorsementRecognizer`) parse a credential's
profile-specific shape and return a normalized form. The default
`recognitionSuite` runs them in registration order and surfaces the first
applies-true match on `CredentialVerificationResult` as
`normalizedVerifiableCredential` + `recognizedProfile` — so consumers can branch
on the recognized profile and reach a typed view of the credential without
re-parsing.

### End-to-end Open Badges wiring

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';
import {
  obv3p0Recognizer,
  obv3p0EndorsementRecognizer,
  openBadgesSuite
} from '@digitalcredentials/verifier-core/openbadges';
import type { Obv3p0OpenBadgeCredential } from '@digitalcredentials/verifier-core/openbadges';

const verifier = createVerifier({
  recognizers: [obv3p0Recognizer, obv3p0EndorsementRecognizer]
});

// One pass: full crypto + recognition + OB semantic checks.
const presResult = await verifier.verifyPresentation({
  presentation: vp,
  additionalSuites: [openBadgesSuite]
});

for (const credResult of presResult.credentialResults) {
  if (credResult.recognizedProfile === 'obv3p0.openbadge') {
    const ob =
      credResult.normalizedVerifiableCredential as Obv3p0OpenBadgeCredential;
    console.log('Achievement:', ob.credentialSubject);
  }
}
```

This is the recommended advanced integration shape for services like
`dcc-transaction-service` that verify a presentation up front and then inspect
each embedded credential's profile to drive downstream business logic. If
performance matters, you're verifying high volumes of credentials, you want to
show partial results to a user for verification in progress, or you have
specific requirements for the verification process, this advanced integration
pattern may be for you.

### Two-pass verification

When a credential has already been cryptographically verified — e.g.
re-rendering a previously-verified credential, or running deeper semantic
analysis on demand — the `phases:` filter lets you re-run only the work you
need. Phases are `'cryptographic' | 'trust' | 'recognition' | 'semantic'`;
requesting `'semantic'` automatically includes `'recognition'` so semantic
checks can consume the normalized form.

```ts
// Pass 1 (default — every phase runs): full crypto + trust + recognition + semantic.
const fullResult = await verifier.verifyCredential({
  credential,
  additionalSuites: [openBadgesSuite]
});

// Pass 2: re-run only the semantic checks (recognition is auto-included).
const semanticOnly = await verifier.verifyCredential({
  credential,
  additionalSuites: [openBadgesSuite],
  phases: ['semantic']
});
// semanticOnly.partial === true
// semanticOnly.results contains only the recognition.profile + OB semantic check entries
```

`partial: true` is set on the result whenever the consumer passed an explicit
`phases:` value, so downstream code can tell that the result covers only a
subset of the pipeline. The default (no `phases:`) leaves `partial` unset —
existing consumers see no change in result shape.

### `applies` predicate contract

A `VerificationSuite` may declare an `applies(subject, context)` predicate. The
orchestrator uses it as follows:

- **Implicit (default suite list):** if `applies` returns false, the suite is
  silently skipped — no entries in `results`.
- **Explicit (suite passed via `additionalSuites`):** if `applies` returns
  false, a synthetic `<suite-id>.applies` `'skipped'` `CheckResult` is emitted
  so the consumer sees their explicit request was acknowledged but not
  actionable.

This is what lets you queue `openBadgesSuite` against an arbitrary credential
and still get a clear signal in the result when the credential isn't an Open
Badge.

### `ProblemDetail.instance` attribution

Failure-outcome `ProblemDetail` entries from semantic and envelope checks carry
an [RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) on
`instance`, locating the offending portion of the credential — aligned with
[RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457). For example, an OB
credential that names a `result.achievedLevel` not declared on the referenced
`ResultDescription` produces:

```ts
{
  type: 'https://www.w3.org/TR/vc-data-model#OB_INVALID_ACHIEVED_LEVEL',
  title: 'Invalid Achieved Level',
  detail: 'Result entry at index 0 claims achievedLevel "urn:lvl:NOT_REAL", ...',
  instance: '/credentialSubject/result/0/achievedLevel',
}
```

UI surfaces can highlight the exact field by walking the pointer.

## Architecture

For internal architecture details — verification pipeline, suite model, type
system, dependencies, and architectural direction — see
[`docs/architecture.md`](docs/architecture.md).

## Migration from earlier 1.0.0-beta.x

This release tightens the public API surface. The following changes may require
small migrations:

- **Demoted from `index.ts`** — these symbols remain reachable via their module
  paths (`@digitalcredentials/verifier-core/dist/...`) but are no longer part of
  the published 1.0 surface: `runSuites`, `createRegistryLookup`,
  `DEFAULT_TTL_MS`, `parseCacheControlMaxAge`, `resolveTtl`,
  `ttlFromValidUntil`, `documentLoaderFromHttpGet`, `fetchJsonFromHttpGet`,
  `extractCredentialsFrom`, `registryKeyHash`. Most callers should build
  verifiers via `createVerifier(...)` rather than reach for these directly.

- **Result-shape changes:**
  - `CredentialVerificationResult.credential` → `verifiableCredential`
    (`s/\.credential\b/.verifiableCredential/` on accessor sites).
  - `PresentationVerificationResult.allResults` removed — replace with
    `flattenPresentationResults(result)`.
  - `PresentationVerificationResult.verifiablePresentation` added — new field
    carrying the parsed VP.

- **Default cache isolation:** two `createVerifier()` calls without an explicit
  `cacheService` no longer share a process-wide cache. To preserve the previous
  "shared" behavior, construct one `InMemoryCacheService` and pass it to each
  verifier explicitly.

- **Legacy result types removed:** `VerificationResponse`,
  `PresentationVerificationResponse`, and friends were already removed from
  `index.ts` in `1.0.0-beta.11`; the type definitions are now gone too. Anyone
  who needed the old shape can pin `1.0.0-beta.11` or earlier.

- **`ProblemTypes` const map added:** built-in problem URIs are now importable
  as `ProblemTypes.INVALID_SIGNATURE` etc. Existing literal-string comparisons
  against `ProblemDetail.type` continue to work unchanged.

- **OBv3 verification is opt-in** — the OBv3 schema suite no longer runs by
  default. Add `openBadgesSuite` (or one of its variants) via `additionalSuites`
  on the verify call to restore previous behavior. See the
  [Open Badges 3.0 verification](#open-badges-30-verification-opt-in-submodule)
  section for details.

- **OBv3 problem-type rename** — `OBV3_INVALID_RESULT_REFERENCE` (and other OB
  problems mirrored on `ProblemTypes`) moved out of the core catalog into
  `OpenBadgesProblemTypes` in the `/openbadges` submodule, and the wire URIs
  shifted from `…#OBV3_*` to `…#OB_*`. Callers comparing literal strings against
  `ProblemDetail.type` need to update the affected literals; callers using the
  constants should switch to the new module.

## Install

Node.js 24+ is required.

### NPM

```
npm install @digitalcredentials/verifier-core
```

### Development

This repo uses [pnpm](https://pnpm.io/).

```
git clone https://github.com/digitalcredentials/verifier-core.git
cd verifier-core
pnpm install
pnpm test            # lint + node tests (vitest)
pnpm run test:browser # playwright (run `pnpm exec playwright install chromium` first)
```

## Contribute

PRs accepted.

## License

[MIT License](LICENSE.md) © 2025 Digital Credentials Consortium.
