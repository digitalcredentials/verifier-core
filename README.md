# verifier-core _(@digitalcredentials/verifier-core)_

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/verifier-core/ci.yml?branch=main)](https://github.com/digitalcredentials/verifier-core/actions?query=workflow%3ACI)

> Verifies W3C Verifiable Credentials in the browser, Node.js, and React Native.

## Table of Contents

- [Overview](#overview)
- [API](#api)
  - [verifyCredential](#verifycredential)
  - [verifyPresentation](#verifypresentation)
  - [createVerifier (batch / repeated verification)](#createverifier-batch--repeated-verification)
  - [Network policy of the built-in HTTP service](#network-policy-of-the-built-in-http-service)
- [Custom Suites](#custom-suites)
- [Per-suite summaries](#per-suite-summaries)
- [Capturing timing data](#capturing-timing-data)
- [Pluggable clock (TimeService)](#pluggable-clock-timeservice)
- [Open Badges 3.0 verification (opt-in submodule)](#open-badges-30-verification-opt-in-submodule)
- [Credential recognition + two-pass verification](#credential-recognition--two-pass-verification)
- [Architecture](#architecture)
- [Migration from earlier 1.x](#migration-from-earlier-1x)
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

| Suite           | Phase           | What it checks                                                                                                                                                                                                                                                                                                                         | Fatal?                               |
| --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Core**        | `cryptographic` | `@context` exists, VC context URI present, VC structure, VP structure, credential ID valid, proof exists                                                                                                                                                                                                                               | Yes                                  |
| **Recognition** | `recognition`   | Pluggable credential-profile recognition; produces a normalized credential form (no-op when no recognizers configured)                                                                                                                                                                                                                 | No                                   |
| **Proof**       | `cryptographic` | Cryptographic signature verification (`proof.signature`; in a proof set, every proof a registered suite can check must verify), a warning for proofs in a set that it cannot check (`proof.unsupported-proofs`), then the credential's validity dates against the verifier's clock (`proof.validity-period`)                           | Yes (`proof.unsupported-proofs`: No) |
| **Status**      | `cryptographic` | Revocation/suspension via BitstringStatusList — sole owner of status verification. `status.bitstring` checks every revocation and suspension `BitstringStatusListEntry`, verifying each list credential's proof with the configured `cryptoServices`. `status.list-issuer` warns when a list is not issued by the credential's issuer. | Yes (`status.list-issuer`: No)       |
| **Registry**    | `trust`         | Issuer DID lookup in known trust registries                                                                                                                                                                                                                                                                                            | No                                   |

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

For OpenID Federation (`oidf`) registries, both the trust anchor's entity
configuration and the issuer's subordinate statement are signature-verified
(ES256 or EdDSA), with their `iss`, `sub` and `exp` checked. Trust is rooted in
the HTTPS fetch of the configured `trustAnchorEC`: there are no pinned anchor
keys. A registry that cannot be checked — unreachable, or serving a statement
that does not verify — is reported as "could not be determined"
(`REGISTRY_UNCHECKED`), not as "not registered", and a lookup that included one
is retried after a minute rather than cached for an hour. When some registries
answered and others could not be checked, `ISSUER_NOT_REGISTERED` says how many
answered, and a `REGISTRY_UNCHECKED` problem names the rest. Pass
`registries: []` to skip the registry check.

#### What the registry check returns

Whenever the lookup ran, the `registry.issuer` outcome carries a
`RegistryCheckPayload` — on success and on failure alike. Read that rather
than parsing the outcome's `message`, which is display text and will not
survive a registry name containing `, `.

```typescript
interface RegistryCheckPayload {
  /** Registries that listed the issuer, in configured order. */
  matches: Array<{
    registry: { name: string; type: 'oidf' | 'dcc-legacy' | 'vc-recognition'; url?: string };
    /** The registry's own record of the issuer, when it has one. */
    entity?: { name?: string; url?: string; logo?: string; raw?: unknown };
  }>;
  /** Registries that could not be reached or did not answer usefully. */
  uncheckedRegistries: Array<{ name: string; type: string; url?: string }>;
}
```

A lookup stops at the first registry that matches, so `matches` normally
holds at most one entry; only a lookup run with `exhaustive: true` returns
more. A registry's `url` is where it is read from: the list URL for
`dcc-legacy` and `vc-recognition`, and the trust anchor's entity
configuration (`trustAnchorEC`) for `oidf`.

`entity` is the registry's description of the issuer, not the credential's
description of itself, so it is the display name to prefer — the credential
cannot alter it. Every registry type populates it.

For `oidf`, the `entity` is the `metadata` of the trust anchor's subordinate
statement: `name` from `federation_entity.organization_name`, `url` from
`homepage_uri`, `logo` from `logo_uri`, and the whole verified `metadata` as
`raw`. It is read only from a statement that has just verified, on a cache hit
as well as on a fresh fetch, since the cached statement is re-verified every
time. An OIDF `logo_uri` may be a `data:` URI holding the image itself rather
than a link to it, so `entity.logo` can be large, and it is cached along with
the rest of the lookup.

For `vc-recognition`, the `entity` is the recognition credential's
`credentialSubject` entry that names the issuer: `name`, `url` and `logo` from
the entry's members of those names, and the whole entry as `raw`. Each of the
three is set only where the entry's value is a string, so an entry whose `name`
is a language map carries no `entity.name` and the value stays readable through
`raw`, as does anything else the entry holds. The credential is verified before
its subject is read, on a cache hit as well as on a fresh fetch.

```typescript
const outcome = result.results.find(r => r.id === 'trust.registry.issuer')
  ?.outcome;
const payload = outcome?.payload as RegistryCheckPayload | undefined;
const displayName = payload?.matches[0]?.entity?.name;
```

A custom handler passed via `registryHandlers` can supply an `entity` on its
`found` result (see `HandlerResult`), and the lookup passes it through.

> [!CAUTION] The DCC registry list does not make claims about the registries it
> contains. It is a list of registries that the DCC knows about — it says
> nothing about the quality, meaning, or value of credentials issued by anyone
> in those registries.

## API

### verifyCredential

```typescript
import {
  verifyCredential,
  type RegistryCheckPayload
} from '@digitalcredentials/verifier-core';

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

  // Pipeline controls:
  recognizers?: RecognizerSpec[]; // See "Credential recognition & two-pass verification"
  phases?: SuitePhase[]; // Run only the suites tagged with these phases
  timing?: boolean; // Attach `timing` to every check, suite, and the result

  // Service overrides (otherwise sensible defaults are used):
  httpGetService?: HttpGetService; // See "Network policy of the built-in HTTP service"
  cacheService?: CacheService;
  cryptoServices?: CryptoService[];
  registryHandlers?: RegistryHandlerMap;
  documentLoader?: DocumentLoader;
  timeService?: TimeService; // See "Pluggable clock (`TimeService`)"
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

`verified` is `true` when no **fatal** check returned a failure. Some checks are
advisory: `trust.registry.issuer`, `recognition.profile`,
`cryptographic.status.list-issuer`, the Open Badges checks (the semantic
`schema.obv3.*` checks and the JSON Schema checks `schema.obv3.json` and
`schema.obv3.declared`), and any check of
your own that leaves `fatal` unset. An advisory failure never flips `verified`,
so a credential whose only failing check is the registry lookup is still
`verified: true` — its `trust.registry` summary carries `status: 'failure'` and
no `fatalFailureAt`, which is how a UI surfaces it as a warning. `results` carries every
check — the ones that passed, the ones that were skipped (with a reason), and
the ones that were not run after a fatal failure — while `summary` provides the
per-suite rollup (see [Per-suite summaries](#per-suite-summaries)).

A fatal failure normally halts every later check for the credential. Two fatal
checks do not halt, because the credential is already known to be authentic when
they run: `proof.validity-period` (expired or not yet valid) and
`status.bitstring` (revoked, suspended, or its status list could not be
trusted). They still make `verified` false, but the checks after them still run,
so an expired credential still reports whether it was revoked, and a revoked one
still reports whether its issuer is registered. A check of your own can do the
same by setting `halts: false` alongside `fatal: true`.

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
  "verifiableCredential": { "...the credential you passed in, unchanged..." },
  "results": [
    { "id": "cryptographic.core.context-exists", "suite": "core",   "outcome": { "status": "success", "message": "Credential has a valid @context property." } },
    { "id": "cryptographic.core.vc-context",     "suite": "core",   "outcome": { "status": "success", "message": "..." } },
    { "id": "cryptographic.core.vc-structure",   "suite": "core",   "outcome": { "status": "success", "message": "..." } },
    { "id": "cryptographic.core.credential-id",  "suite": "core",   "outcome": { "status": "success", "message": "..." } },
    { "id": "cryptographic.core.proof-exists",   "suite": "core",   "outcome": { "status": "success", "message": "..." } },
    { "id": "recognition.profile", "suite": "recognition", "outcome": { "status": "skipped", "reason": "no recognizer matched" } },
    { "id": "cryptographic.proof.signature",     "suite": "proof",  "outcome": { "status": "success", "message": "Signature verified successfully." } },
    { "id": "cryptographic.proof.unsupported-proofs", "suite": "proof", "outcome": { "status": "success", "message": "Every proof was checked." } },
    { "id": "cryptographic.proof.validity-period", "suite": "proof", "outcome": { "status": "success", "message": "The credential is within its validity period." } },
    { "id": "cryptographic.status.bitstring",    "suite": "status", "outcome": { "status": "success", "message": "Credential status is valid (not revoked or suspended)." } },
    { "id": "cryptographic.status.list-issuer",  "suite": "status", "outcome": { "status": "success", "message": "Every status list is issued by the credential's issuer." } },
    { "id": "trust.registry.issuer", "suite": "registry",   "outcome": {
      "status": "success",
      "message": "Issuer found in registry: DCC Sandbox Registry",
      "payload": {
        "matches": [
          {
            "registry": {
              "name": "DCC Sandbox Registry",
              "type": "dcc-legacy",
              "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
            },
            "entity": {
              "name": "Example University",
              "url": "https://example.edu",
              "raw": { "name": "Example University", "url": "https://example.edu" }
            }
          }
        ],
        "uncheckedRegistries": []
      }
    } }
  ]
}
```

#### Example: Invalid signature (fatal)

An invalid signature is fatal — it means any part of the credential could have
been tampered with, so every later check for the credential, in any suite, is
halted. Each check that would have run appears as `skipped` with reason
`Not run: <check-id> failed`.

```json
{
  "verified": false,
  "results": [
    {
      "id": "cryptographic.core.context-exists",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.vc-context",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.vc-structure",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.credential-id",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.proof-exists",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "recognition.profile",
      "suite": "recognition",
      "outcome": { "status": "skipped", "reason": "no recognizer matched" }
    },
    {
      "id": "cryptographic.proof.signature",
      "suite": "proof",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#INVALID_SIGNATURE",
            "title": "Invalid Signature",
            "detail": "Invalid signature."
          }
        ]
      }
    },
    {
      "id": "cryptographic.proof.unsupported-proofs",
      "suite": "proof",
      "outcome": {
        "status": "skipped",
        "reason": "Not run: proof.signature failed"
      }
    },
    {
      "id": "cryptographic.proof.validity-period",
      "suite": "proof",
      "outcome": {
        "status": "skipped",
        "reason": "Not run: proof.signature failed"
      }
    },
    {
      "id": "cryptographic.status.bitstring",
      "suite": "status",
      "outcome": {
        "status": "skipped",
        "reason": "Not run: proof.signature failed"
      }
    },
    {
      "id": "cryptographic.status.list-issuer",
      "suite": "status",
      "outcome": {
        "status": "skipped",
        "reason": "Not run: proof.signature failed"
      }
    },
    {
      "id": "trust.registry.issuer",
      "suite": "registry",
      "outcome": {
        "status": "skipped",
        "reason": "Not run: proof.signature failed"
      }
    }
  ]
}
```

#### Example: Expired credential (fatal, does not halt)

An expired credential is authentic — its signature verified — but outside its
validity period. `proof.validity-period` fails it, so `verified` is `false`, but
does not halt: the status, list-issuer and registry checks still run, and here
the status list also marks it revoked. Abbreviated to the rows that matter:

```json
{
  "verified": false,
  "results": [
    {
      "id": "cryptographic.proof.signature",
      "suite": "proof",
      "outcome": {
        "status": "success",
        "message": "Signature verified successfully."
      }
    },
    {
      "id": "cryptographic.proof.validity-period",
      "suite": "proof",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#CREDENTIAL_EXPIRED",
            "title": "Credential Expired",
            "detail": "The current date time (2026-10-20T12:00:00.000Z) is after \"validUntil\" (2021-01-01T00:00:00Z)."
          }
        ]
      }
    },
    {
      "id": "cryptographic.status.bitstring",
      "suite": "status",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#CREDENTIAL_REVOKED",
            "title": "Credential Revoked",
            "detail": "The status list https://example.edu/status/1 marks the credential revoked (index 42)."
          }
        ]
      }
    },
    {
      "id": "cryptographic.status.list-issuer",
      "suite": "status",
      "outcome": {
        "status": "success",
        "message": "Every status list is issued by the credential's issuer."
      }
    },
    {
      "id": "trust.registry.issuer",
      "suite": "registry",
      "outcome": {
        "status": "success",
        "message": "Issuer found in registry: DCC Sandbox Registry"
      }
    }
  ]
}
```

Both the `proof` and the `status` summaries carry `fatalFailureAt`.

#### Example: Revoked credential (fatal, sourced from status)

When a credential's status list marks it revoked or suspended — or the verifier
can't confidently evaluate the list (missing, expired or not yet valid, wrong
type, signature invalid) — the status suite fails the credential. The proof
check still passes on its own merits, and because `status.bitstring` does not
halt, the list-issuer and registry checks still run.

Every `BitstringStatusListEntry` whose `statusPurpose` is `revocation` or
`suspension` is checked, and each set bit is its own problem:
`CREDENTIAL_REVOKED` or `CREDENTIAL_SUSPENDED`. Other `credentialStatus` entries
— legacy types such as `StatusList2021Entry`, unknown types, and
`BitstringStatusListEntry`s for other purposes — are ignored, their lists are
not fetched, and the check's message or skip reason names them.

```json
{
  "verified": false,
  "results": [
    {
      "id": "cryptographic.core.context-exists",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.vc-context",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.vc-structure",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.credential-id",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "cryptographic.core.proof-exists",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." }
    },
    {
      "id": "recognition.profile",
      "suite": "recognition",
      "outcome": { "status": "skipped", "reason": "no recognizer matched" }
    },
    {
      "id": "cryptographic.proof.signature",
      "suite": "proof",
      "outcome": {
        "status": "success",
        "message": "Signature verified successfully."
      }
    },
    {
      "id": "cryptographic.status.bitstring",
      "suite": "status",
      "outcome": {
        "status": "failure",
        "problems": [
          {
            "type": "https://www.w3.org/TR/vc-data-model#CREDENTIAL_REVOKED",
            "title": "Credential Revoked",
            "detail": "The status list https://example.edu/status/1 marks the credential revoked (index 42)."
          }
        ]
      }
    },
    {
      "id": "cryptographic.status.list-issuer",
      "suite": "status",
      "outcome": {
        "status": "success",
        "message": "Every status list is issued by the credential's issuer."
      }
    },
    {
      "id": "trust.registry.issuer",
      "suite": "registry",
      "outcome": {
        "status": "success",
        "message": "Issuer found in registry: DCC Sandbox Registry"
      }
    }
  ]
}
```

#### Example: Status list from another issuer (non-fatal)

`status.list-issuer` compares each status list's `issuer` id with the
credential's (a string issuer, or an issuer object's `id`, compared exactly).
It compares only lists whose proof verified, which binds the list's signing key
to its claimed issuer; a list whose proof did not verify is left to
`status.bitstring`, and this check is skipped. That includes a list that marks
the credential revoked, so a revocation read from someone else's list says so.
When they differ, the check fails with `STATUS_LIST_ISSUER_MISMATCH`:

```json
{
  "id": "cryptographic.status.list-issuer",
  "suite": "status",
  "fatal": false,
  "outcome": {
    "status": "failure",
    "problems": [
      {
        "type": "https://www.w3.org/TR/vc-data-model#STATUS_LIST_ISSUER_MISMATCH",
        "title": "Status List Issuer Mismatch",
        "detail": "The status list https://status.example.edu/lists/1 is issued by did:key:z6Mk…, not by the credential's issuer did:web:example.edu."
      }
    ]
  }
}
```

This is a warning, so `verified` is unchanged. Some status services sign every
list with a DID of their own rather than the issuer's, so a mismatch is normal
in those deployments. It does mean that whoever signed the list decided the
credential's status; a consumer that needs the list bound to the issuer should
treat `STATUS_LIST_ISSUER_MISMATCH` as decisive.

#### Example: Check skipped

Checks skip when they're irrelevant to the input. For instance, a credential
with no `credentialStatus` skips the status check:

```json
{
  "id": "cryptographic.status.bitstring",
  "suite": "status",
  "outcome": {
    "status": "skipped",
    "reason": "Credential has no credentialStatus."
  }
}
```

#### Error taxonomy

All failures use `ProblemDetail` with a `type` URI. Common error types:

| Type URI                          | Title                                                                                                                                                          | When                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `...#PARSING_ERROR`               | Credential Parsing Failed / Invalid Credential Structure / Invalid Presentation Structure / Invalid JSON-LD / No VC Context / Invalid Credential ID / No Proof | Envelope gate or `core` structural problems                                                                        |
| `...#INVALID_SIGNATURE`           | Invalid Signature                                                                                                                                              | Signature doesn't match content                                                                                    |
| `...#VERIFICATION_METHOD_ERROR`   | Verification Method Error                                                                                                                                      | The proof's verification method is missing or not the issuer's                                                     |
| `...#PROOF_UNSUPPORTED`           | Unsupported Proof                                                                                                                                              | No registered suite supports the proof, or it was made for another purpose; a warning beside a proof that verified |
| `...#CREDENTIAL_EXPIRED`          | Credential Expired                                                                                                                                             | `validUntil` / `expirationDate` has passed; authentic                                                              |
| `...#CREDENTIAL_NOT_YET_VALID`    | Credential Not Yet Valid                                                                                                                                       | `validFrom` / `issuanceDate` in the future; authentic                                                              |
| `...#DID_WEB_UNRESOLVED`          | DID Web Unresolved                                                                                                                                             | `did:web` document couldn't be fetched                                                                             |
| `...#HTTP_ERROR`                  | HTTP Error                                                                                                                                                     | Network error during signature check, including a DID document fetch for a key that is not the issuer's            |
| `...#CREDENTIAL_REVOKED`          | Credential Revoked                                                                                                                                             | A revocation status list marks the credential revoked                                                              |
| `...#CREDENTIAL_SUSPENDED`        | Credential Suspended                                                                                                                                           | A suspension status list marks the credential suspended                                                            |
| `...#STATUS_LIST_NOT_FOUND`       | Status List Not Found                                                                                                                                          | Status list URL unreachable                                                                                        |
| `...#STATUS_LIST_EXPIRED`         | Status List Expired                                                                                                                                            | Status list VC has expired                                                                                         |
| `...#STATUS_LIST_NOT_YET_VALID`   | Status List Not Yet Valid                                                                                                                                      | Status list VC is not valid yet                                                                                    |
| `...#STATUS_LIST_SIGNATURE_ERROR` | Status List Signature Error                                                                                                                                    | Status list VC signature invalid                                                                                   |
| `...#STATUS_LIST_ISSUER_MISMATCH` | Status List Issuer Mismatch                                                                                                                                    | Status list not issued by the credential's issuer (non-fatal)                                                      |
| `...#ISSUER_NOT_REGISTERED`       | Issuer Not Registered                                                                                                                                          | Issuer DID not found in any registry that could be checked                                                         |
| `...#REGISTRY_UNCHECKED`          | Registry Unchecked                                                                                                                                             | Some registries couldn't be reached                                                                                |

`CREDENTIAL_EXPIRED` and `CREDENTIAL_NOT_YET_VALID` come from
`proof.validity-period`, which runs only after `proof.signature` has verified.
They are fatal, like `INVALID_SIGNATURE`, but they mean the opposite thing about
the issuer: a credential that fails on its dates is authentic and merely outside
its window; tell your users that, not that the credential may be forged. They do
not halt, so the credential's status and issuer are still reported. The date is judged against the verifier's `TimeService` (see
[Pluggable clock](#pluggable-clock-timeservice)), the same clock the status
check uses for status-list freshness.

`VERIFICATION_METHOD_ERROR` comes from `proof.signature` too, and is fatal in
the same way, but it is a statement about the issuer's keys rather than about
the content: the proof names a verification method that cannot be found, that
its controller has not authorized for the proof purpose, or that belongs to
someone other than the credential's issuer. Nothing was necessarily altered —
the issuer's key setup does not back the proof it published. The `detail` is
the signature library's own message, so it names the method and the fault.

`PROOF_UNSUPPORTED` marks a proof this verifier did not check: its cryptosuite
is not one a registered suite supports, or it was made for a different proof
purpose. A credential may carry a proof set so that different verifiers can
each check the proof they support, so beside a proof that verified it is only a
warning, on the non-fatal `proof.unsupported-proofs` check. When no proof could
be checked at all, `proof.signature` fails with it instead.

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
  case ProblemTypes.VERIFICATION_METHOD_ERROR:
    // The issuer's key setup is wrong — not evidence of tampering.
    break;
  case ProblemTypes.CREDENTIAL_EXPIRED:
  case ProblemTypes.CREDENTIAL_NOT_YET_VALID:
    // Authentic, outside its validity window — not a forgery.
    break;
  case ProblemTypes.CREDENTIAL_REVOKED:
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
  domain: 'verifier.example', // Optional: expected domain (requires challenge)
  unsignedPresentation: false, // Optional: accept a VP with no proof
  registries // Optional: issuer trust registries
});
```

#### Options

```typescript
interface VerifyPresentationOptions {
  presentation: unknown;
  challenge?: string | null;
  domain?: string;
  unsignedPresentation?: boolean;
  registries?: EntityIdentityRegistry[];
  additionalSuites?: VerificationSuite[];

  // Pipeline controls:
  recognizers?: RecognizerSpec[]; // See "Credential recognition & two-pass verification"
  phases?: SuitePhase[]; // Run only the suites tagged with these phases
  timing?: boolean; // Attach `timing` to every check, suite, and the result

  // Service overrides (otherwise sensible defaults are used):
  httpGetService?: HttpGetService; // See "Network policy of the built-in HTTP service"
  cacheService?: CacheService;
  cryptoServices?: CryptoService[];
  registryHandlers?: RegistryHandlerMap;
  documentLoader?: DocumentLoader;
  timeService?: TimeService; // See "Pluggable clock (`TimeService`)"
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
the same shape as `verifyCredential`'s `results`: every check that ran, was
skipped, or was not run after a fatal failure. The
top-level `summary` rolls up the VP envelope's own suites; per-credential
rollups live on `credentialResults[i].summary`.

Presentation verification does two things:

1. **Verifies the VP itself** — checks the presentation's structure
   (`core.vp-structure`), then its signature. A VP with no proof fails unless
   `unsignedPresentation: true`, in which case the check is skipped. A proof
   that is present is always verified. When `challenge` is passed, the
   presentation's proof must use the `authentication` purpose and carry that
   challenge (and `domain`, if passed). Without it only the signature is
   checked. Results go in `presentationResults`.
2. **Verifies each embedded credential** — extracts credentials from the VP and
   runs `verifyCredential` on each. Results go in `credentialResults`.

`verified` is `true` when no **fatal** presentation check failed and every
embedded credential is itself `verified`. The same checks are advisory here as
for a single credential (`trust.registry.issuer`, `recognition.profile`,
`cryptographic.status.list-issuer`, the Open Badges checks, and any check of
your own that leaves `fatal` unset): an embedded credential whose only failure
is advisory is `verified: true`, and so, on its account, is the presentation.

The VP is returned as `verifiablePresentation` — the object you passed in,
unchanged — mirroring the wire-level
property name so callers (and downstream systems whose templates reach into
result objects by property path) can reach it without carrying the original
input separately.

A VP needn't be signed — it can simply package credentials together. Set
`unsignedPresentation: true` to accept a VP that has no proof; its
`proof.signature` check is then skipped. The flag never turns off verification
of a proof that is present.

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

### Network policy of the built-in HTTP service

Verification fetches URLs the credential chooses: JSON-LD contexts, `did:web`
documents, status lists and registries. The built-in `BuiltinHttpGetService` is
safe to point at them, including on a server:

- **https only, and no local addresses.** It refuses `http:` and other schemes,
  `localhost` and `*.localhost`, and loopback, private (including carrier-grade
  NAT), link-local (including `169.254.169.254`) and unspecified IP literals,
  IPv4 and IPv6.
- **Redirects are checked hop by hop**, before each is requested, and at most
  five are followed.
- **A 10 s deadline and a 5 MB body cap** cover each request. Change them by
  constructing the service yourself:

  ```typescript
  import {
    BuiltinHttpGetService,
    createVerifier
  } from '@digitalcredentials/verifier-core';

  const verifier = createVerifier({
    httpGetService: BuiltinHttpGetService({
      timeoutMs: 20_000,
      maxBytes: 1_000_000
    })
  });
  ```

- **The body is read once** and parsed as JSON whatever its content type; a body
  that is not JSON is returned as text.
- **Errors never quote the response.** They name the URL and the reason, so
  nothing fetched leaks into a result's problem details.

JSON-LD contexts that are not bundled are fetched under this same policy. To
verify against a closed set of contexts instead, pass your own `documentLoader`.

There is no switch to relax the policy. For local testing, use a tunnel or a
local DNS name with a valid certificate. Hosts are judged by name or literal
only: there is no portable DNS lookup, so a public name that resolves to a
private address is not caught.

An injected `httpGetService` or `documentLoader` replaces all of this. If you
inject one, its network policy is yours.

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

## Per-suite summaries

Each `CredentialVerificationResult` and `PresentationVerificationResult` carries
a `summary: SuiteSummary[]` rollup of per-suite outcomes alongside the full
`results[]` list.

```ts
const result = await verifier.verifyCredential({ credential });
// result.summary[i] = { id, phase, suite, status, message, counts, fatalFailureAt?, ... }
// result.results[]  = every check that ran, was skipped, or was not run,
//                     each with its .id

// Detail rows for one summary entry — filter by status for just the failures.
const failures = result.results.filter(
  r => r.id.startsWith(result.summary[0].id + '.') &&
       r.outcome.status === 'failure'
);
```

Render from `summary[]` and lazy-expand into `results[]`.

Check ids and the built-in suites' `phase` tags are fixed for 2.x. An id
embeds its suite's phase, so re-tagging a built-in suite would rename every
check in it: changing either is a breaking change.

See [`docs/api/verification-results.md`](./docs/api/verification-results.md) for
the full reference (phase model, `SuiteSummary` fields, `id` namespace, and a UI
rendering recipe).

## Capturing timing data

Every result can carry per-check, per-suite, and per-call `TaskTiming` data
(wall-clock `startedAt` / `endedAt` plus a monotonic `durationMs`). Off by
default; opt in via `timing: true` on `createVerifier(...)` or per-call.
Per-call wins, and `verifyPresentation` propagates the flag into embedded
`verifyCredential` calls so the top-level `result.timing` is an inclusive
wrapper.

```ts
const verifier = createVerifier({ timing: true });
const result = await verifier.verifyCredential({ credential });
console.log(result.timing!.durationMs);
console.log(result.summary[0].timing!.durationMs);
```

Per-check timings ride on every row of `results[]`, and the per-suite rollup
lives on `summary[i].timing`. See
[`docs/api/timing.md`](./docs/api/timing.md) for the full reference, granularity
table, and recipes.

## Pluggable clock (`TimeService`)

`verifier-core` reads wall-clock and monotonic time through a small
`TimeService` interface. The default is `RealTimeService` (`Date.now` /
`performance.now`); pass `{ timeService: FakeTimeService() }` on
`createVerifier(...)` in tests to make every `TaskTiming` field
exact-value-assertable. Both factories are exported from the package barrel.

The same clock decides validity dates: `proof.validity-period` judges a credential's
`validUntil` / `expirationDate` and `validFrom` / `issuanceDate` against it, and
`status.bitstring` judges status-list freshness against it, so the two can never
disagree within a verification. A verifier built on a `FakeTimeService` pinned
inside a credential's validity window verifies that credential. Signature
clock-skew windows and key rotation are still ahead — see
[`docs/api/timing.md`](./docs/api/timing.md) for the reference.

## Open Badges 3.0 verification (opt-in submodule)

Open Badges 3.0 verification ships as two opt-in submodules:

- `@digitalcredentials/verifier-core/openbadges` — the semantic checks,
  recognizers, Zod schemas, problem types and vocabulary. It loads no JSON
  Schema validator.
- `@digitalcredentials/verifier-core/openbadges/schema` — JSON Schema
  validation, which loads AJV and the bundled Open Badges schemas.

Neither is part of the default suite list; consumers that want OB checks pass
`openBadgesSuite` (or one of the bundled variants) via `additionalSuites` on a
verify call.

> [!IMPORTANT] If you were on `1.0.0-beta.x` and relied on its schema check
> running by default, you now need to opt in explicitly. The simplest migration
> is to add `openBadgesSuite` from `/openbadges/schema` to your verify call.

### Enabling OB verification

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';
import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges/schema';

const verifier = createVerifier();
const result = await verifier.verifyCredential({
  credential,
  additionalSuites: [openBadgesSuite]
});
```

### Bundle variants

| Bundle                    | Contents                                                            | Import from          | Applies to                                     |
| ------------------------- | ------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| `openBadgesSuite`         | Semantic checks **and** the JSON Schema checks (the default bundle) | `/openbadges/schema` | `OpenBadgeCredential`, `EndorsementCredential` |
| `openBadgesSemanticSuite` | Cross-field semantic checks only                                    | `/openbadges`        | `OpenBadgeCredential`                          |
| `openBadgesSchemaSuite`   | The JSON Schema checks only                                         | `/openbadges/schema` | `OpenBadgeCredential`, `EndorsementCredential` |

In `openBadgesSuite`, the semantic checks report `skipped` for an
`EndorsementCredential`.

### JSON Schema validation

`schema.obv3.json` validates a credential against the JSON Schema the Open
Badges 3.0 specification gives for its type and VC version. The four schemas are
bundled with the package, copied from the specification's appendix:

| Credential                      | Schema                             |
| ------------------------------- | ---------------------------------- |
| `OpenBadgeCredential`, VC 2.0   | E.2.1.2 AchievementCredential      |
| `OpenBadgeCredential`, VC 1.1   | E.2.1.34 AchievementCredentialv1p1 |
| `EndorsementCredential`, VC 2.0 | E.2.1.7 EndorsementCredential      |
| `EndorsementCredential`, VC 1.1 | E.2.1.36 EndorsementCredentialv1p1 |

Nothing is fetched. A VC 1.1 credential is validated only against the VC 1.1
schema, never one that also accepts VC 2.0. The credential's own
`credentialSchema` does not choose the schema: an issuer cannot swap in a schema
of its own.

Instead, `schema.obv3.declared` reports a declared `credentialSchema` that does
not fit the credential:

- `OB_DECLARED_SCHEMA_MISMATCH` — a known Open Badges 3.0 schema URL for the
  other credential type, or one that does not accept the credential's VC
  version.
- `OB_DECLARED_SCHEMA_NOT_CHECKED` — a URL that is not a known Open Badges 3.0
  schema, even alongside one that fits. It is not fetched or checked.

Known URLs are the published schemas under
`https://purl.imsglobal.org/spec/ob/v3p0/schema/` (`json/` and `json-ld/`, the
strict and "Any" variants) and the `$id`s of the schemas in the specification.
The check reports `skipped` when nothing is declared. Like every Open Badges
check, neither changes `verified`.

The bundled schemas are compiled with AJV once per process, on first use. AJV
compiles with `new Function`, so a page whose Content Security Policy forbids
`unsafe-eval` cannot run the schema checks; use `openBadgesSemanticSuite` there.
Importing `/openbadges` alone never loads AJV or the schemas.

The schemas follow the specification exactly, so they reject some forms that are
equivalent in JSON-LD and that the semantic checks accept. For example,
`image.type` must be the string `"Image"`; `["Image"]` fails `schema.obv3.json`
with an error at `/image/type`.

Maintainers refresh the bundled schemas by hand with
`node scripts/refresh-ob-schemas.mjs` (add `--fixtures` to refresh the published
copies the tests compare them with). Nothing in the build, the tests or CI
fetches a schema.

### Problem types

OB-specific problem URIs live on `OpenBadgesProblemTypes` (also exported as
`Obv3ProblemTypes` for symmetry with internal naming):

```ts
import {
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
  case OpenBadgesProblemTypes.OB_DECLARED_SCHEMA_MISMATCH:
  case OpenBadgesProblemTypes.OB_DECLARED_SCHEMA_NOT_CHECKED:
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
  obv3p0EndorsementRecognizer
} from '@digitalcredentials/verifier-core/openbadges';
import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges/schema';
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

This is the recommended advanced integration shape for a service that verifies
a presentation up front and then inspects each embedded credential's profile to
drive downstream business logic. If
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

## Migration from earlier 1.x

2.0.0 is a major update. This section maps the last 1.x release, 1.0.0-beta.11, to
2.0.0. `verifyCredential` and `verifyPresentation` keep their names, but their
options and results change. Check ids below are the `CheckResult.id` values (see
[verification results](docs/api/verification-results.md)).

### Options

| 1.0.0-beta.11                         | 2.0.0                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `knownDIDRegistries`                  | `registries: EntityIdentityRegistry[]` — the DCC known-registries list works unchanged  |
| `reloadIssuerRegistry`                | Removed. Lookups are cached in the `cacheService`; reuse a `createVerifier` instance    |
| `challenge` (default `'meaningless'`) | `challenge` (default `null`). A supplied challenge is always enforced                   |
| `unsignedPresentation`                | Same name; it now only accepts a presentation with no proof                             |
| —                                     | New: `domain`, `additionalSuites`, `phases`, `recognizers`, `timing`, service overrides |

### Credential result

| 1.0.0-beta.11 (`VerificationResponse`)         | 2.0.0 (`CredentialVerificationResult`)                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| —                                              | `verified`: `false` when any fatal check failed (bad signature, expired, revoked, …)                                   |
| `credential`                                   | `verifiableCredential` — the object you passed in, unchanged                                                           |
| `errors[]` (fatal: unparseable, bad signature) | `results[]` rows with `fatal: true` and `outcome.status: 'failure'`; details in `outcome.problems`                     |
| `log[valid_signature]`                         | `cryptographic.proof.signature`                                                                                        |
| `log[expiration]`                              | `cryptographic.proof.validity-period` (`CREDENTIAL_EXPIRED`, `CREDENTIAL_NOT_YET_VALID`)                               |
| `log[revocation_status]`                       | `cryptographic.status.bitstring` (`CREDENTIAL_REVOKED`, `CREDENTIAL_SUSPENDED`)                                        |
| `log[registered_issuer].valid`                 | `trust.registry.issuer` `outcome.status` (`success` / `failure`; non-fatal)                                            |
| `log[registered_issuer].matchingIssuers[]`     | `trust.registry.issuer` `outcome.payload.matches[]`; `.issuer` → `.entity.raw`, with `.entity.name` / `.url` / `.logo` |
| `log[registered_issuer].uncheckedRegistries[]` | `trust.registry.issuer` `outcome.payload.uncheckedRegistries[]`                                                        |
| `additionalInformation[schema_check]`          | No default equivalent. The opt-in Open Badges schema suite reports a `schema.obv3.json` row                            |
| —                                              | `summary[]`, one rollup per suite                                                                                      |

A `log` step's `valid: true` becomes `outcome.status: 'success'`; `valid: false`
becomes `'failure'` with `outcome.problems`. A check that did not apply is
`'skipped'` with a `reason`.

### Presentation result

| 1.0.0-beta.11 (`PresentationVerificationResponse`) | 2.0.0 (`PresentationVerificationResult`)                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| —                                                  | `verified`: the presentation and every credential in it passed              |
| —                                                  | `verifiablePresentation` — the object you passed in, unchanged              |
| `presentationResult.signature: 'valid'`            | `presentationResults` row `cryptographic.proof.signature` with `'success'`  |
| `presentationResult.signature: 'invalid'`          | that row with `'failure'`                                                   |
| `presentationResult.signature: 'unsigned'`         | that row with `'skipped'`, its `reason` saying the presentation is unsigned |
| `credentialResults[]`                              | `credentialResults[]`, each a `CredentialVerificationResult`                |
| `errors[]`                                         | `verified: false`, with the failing rows in `presentationResults`           |

`flattenPresentationResults(result)` lists every row of a presentation and its
credentials in one array.

### Before and after

1.0.0-beta.11:

```javascript
const result = await verifyCredential({ credential, knownDIDRegistries });
if (result.errors) {
  console.log('fatal:', result.errors[0].message);
} else {
  const step = id => result.log.find(s => s.id === id);
  console.log('signature ok:', step('valid_signature').valid);
  console.log('not expired:', step('expiration').valid);
  const match = step('registered_issuer').matchingIssuers[0];
  console.log('issuer:', match?.issuer.federation_entity?.organization_name);
}
```

2.0.0:

```typescript
import {
  verifyCredential,
  type RegistryCheckPayload
} from '@digitalcredentials/verifier-core';

const result = await verifyCredential({ credential, registries });
const row = (id: string) => result.results.find(r => r.id === id);
console.log('verified:', result.verified);
console.log(
  'signature ok:',
  row('cryptographic.proof.signature')?.outcome.status === 'success'
);
console.log(
  'not expired:',
  row('cryptographic.proof.validity-period')?.outcome.status === 'success'
);
const registry = row('trust.registry.issuer')?.outcome;
const payload =
  registry && registry.status !== 'skipped'
    ? (registry.payload as RegistryCheckPayload | undefined)
    : undefined;
console.log('issuer:', payload?.matches[0]?.entity?.name);
for (const r of result.results) {
  if (r.outcome.status === 'failure')
    console.log(r.id, r.outcome.problems[0].title);
}
```

### Open Badges

1.x checked Open Badges 3.0 credentials, and any listed `credentialSchema`,
against JSON Schema by default. 2.0 does not. Add `openBadgesSuite` from
`@digitalcredentials/verifier-core/openbadges/schema` to `additionalSuites` to
check Open Badges credentials (see
[Open Badges 3.0 verification](#open-badges-30-verification-opt-in-submodule)).
It validates against schemas bundled with the package and never fetches the URLs
in `credentialSchema`. JSON Schema validation of other credential types is not
included.

Code that imports `openBadgesSuite`, `openBadgesSchemaSuite` or
`obv3SchemaCheck` from `@digitalcredentials/verifier-core/openbadges` (for
example, an Open Badges suite resolver in a verification service) imports them
from `@digitalcredentials/verifier-core/openbadges/schema` instead.

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

To publish a release, see [RELEASING.md](RELEASING.md).

## Contribute

PRs accepted.

## License

[MIT License](LICENSE.md) © 2025 Digital Credentials Consortium.
