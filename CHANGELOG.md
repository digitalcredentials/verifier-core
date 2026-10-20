# @digitalcredentials/verifier-core CHANGELOG

## 2.0.0 - Unreleased

A complete rewrite relative to 1.0.0-beta.11. Verification now runs as suites of
named checks, every check that ran is reported, and the result carries an
overall `verified` verdict. `verifyCredential` and `verifyPresentation` keep
their names, but their options and results have changed: see
[Migration from earlier 1.0.0-beta.x](README.md#migration-from-earlier-100-betax)
for a field-by-field map.

### Breaking

- **New result shapes.** `verifyCredential` returns a
  `CredentialVerificationResult` (`verified`, `verifiableCredential`, `results`,
  `summary`) in place of `{ credential, errors, log, additionalInformation }`.
  `verifyPresentation` returns a `PresentationVerificationResult` (`verified`,
  `verifiablePresentation`, `presentationResults`, `credentialResults`,
  `summary`) in place of `{ presentationResult, credentialResults, errors }`.
  Failures are `CheckResult` rows carrying `ProblemDetail`s; nothing is reported
  through a top-level `errors` array.
- **`verified` is a verdict.** 1.x reported each step and left the conclusion to
  the caller. In 2.0 a credential that is expired, not yet valid, revoked or
  suspended has `verified: false`, alongside a bad signature. An issuer that is
  not in any registry is a warning: `verified` stays `true`.
- **`knownDIDRegistries` is replaced by
  `registries: EntityIdentityRegistry[]`**, and `reloadIssuerRegistry` is
  removed. The DCC known-registries list can be passed as `registries`
  unchanged. Registry matches move from `log[registered_issuer].matchingIssuers`
  to the `trust.registry.issuer` result's `outcome.payload.matches`.
- **`challenge` defaults to `null`** (was `'meaningless'`). A supplied challenge
  is always enforced, whatever proof purpose the presentation claims.
- **`unsignedPresentation: true` only accepts a presentation that has no
  proof.** A proof that is present is always verified.
- **No JSON Schema validation by default.** 1.x validated every
  `credentialSchema` a credential listed, and Open Badges 3.0 credentials, and
  reported it in `additionalInformation`. 2.0 runs no JSON Schema check unless
  you add `openBadgesSchemaSuite` or `openBadgesSuite` from
  `@digitalcredentials/verifier-core/openbadges`, and those apply only to
  `OpenBadgeCredential`.
- **Node.js 24 or later** (`engines.node` was `>=18`), because the dependencies
  require it.

### Added

- **`createVerifier(config)`** builds a reusable `Verifier`. Reuse one for
  repeated verification so DID documents, status lists, contexts and registry
  lookups are cached across calls. `verifyCredential` / `verifyPresentation` are
  one-shot wrappers around it.
- **Suites and checks.** The default suites — `coreSuite`, `recognitionSuite`,
  `proofSuite`, `statusSuite`, `registrySuite` — are exported, and callers can
  add their own `VerificationSuite`s through `additionalSuites`, or run a subset
  with `phases`. Every result row has a stable id, `<phase>.<suite>.<check>`
  (for example `cryptographic.proof.signature`); ids and phases are fixed for
  2.x. A fatal check makes `verified` false; most fatal checks also stop later
  checks, but validity dates and status do not, so an expired credential still
  reports revocation and its issuer.
- **Per-suite `summary: SuiteSummary[]`** beside `results[]`, which lists every
  check that ran, was skipped (with its reason) or was not run. Helpers:
  `flattenPresentationResults`, `foldCheckResults`, `computeId`. See
  [`docs/api/verification-results.md`](docs/api/verification-results.md).
- **`ProblemTypes`**: problem URIs for every failure the verifier reports, among
  them `CREDENTIAL_EXPIRED` and `CREDENTIAL_NOT_YET_VALID` (distinct from
  `INVALID_SIGNATURE`), `VERIFICATION_METHOD_ERROR`, `DID_WEB_UNRESOLVED`,
  `PROOF_UNSUPPORTED`, `CREDENTIAL_REVOKED` / `CREDENTIAL_SUSPENDED`,
  `STATUS_LIST_ISSUER_MISMATCH`, `ISSUER_NOT_REGISTERED` and
  `REGISTRY_UNCHECKED`.
- **Proofs.** `ecdsa-rdfc-2019` (P-256 and P-384 Multikey) alongside
  Ed25519Signature2020 and `eddsa-rdfc-2022`. Each proof in a proof set is
  verified on its own and all must pass; a proof in an unsupported cryptosuite
  is reported by `proof.unsupported-proofs` as a warning. `domain` on
  `verifyPresentation`, checked alongside `challenge`.
- **Status.** Every revocation and suspension `BitstringStatusListEntry` is
  checked, the status list's proof is verified with the configured crypto
  services, and the non-fatal `status.list-issuer` check reports a list signed
  by someone other than the credential's issuer.
- **Registries.** `oidf` (OpenID Federation, with signature-verified entity
  statements), `dcc-legacy` and `vc-recognition` registries. The
  `trust.registry.issuer` result carries a `RegistryCheckPayload`: `matches`,
  each with the registry's own record of the issuer as `entity` (`name`, `url`,
  `logo`, `raw`), and the `uncheckedRegistries` that could not be reached.
  Custom lookups through `registryHandlers`.
- **Pluggable services**, each with a default: `CacheService`
  (`InMemoryCacheService`), `HttpGetService` (`BuiltinHttpGetService`, which
  fetches https only, refuses local and private addresses, and has a 10 s
  deadline and 5 MB body cap — see
  [Network policy](README.md#network-policy-of-the-built-in-http-service)),
  `CryptoService` (`DataIntegrityCryptoService`) and `TimeService`
  (`RealTimeService`, `FakeTimeService`), which decides "now" for validity dates
  and status-list freshness.
- **`timing`** option: attaches a `TaskTiming` to every check, summary and
  result. See [`docs/api/timing.md`](docs/api/timing.md).
- **Open Badges 3.0** in the opt-in submodule
  `@digitalcredentials/verifier-core/openbadges`: `openBadgesSemanticSuite`
  (Zod-based checks, no network), `openBadgesSchemaSuite` (JSON Schema, with the
  published schemas cached), `openBadgesSuite` (both), the `obv3p0Recognizer` /
  `obv3p0EndorsementRecognizer` recognizers, the Zod schemas and
  `OpenBadgesProblemTypes`.
- **Credential recognition**: `recognizers` parse a credential into a known
  profile and report it as `recognizedProfile` and
  `normalizedVerifiableCredential`.
- `parseCredential` / `parsePresentation` and the `VerifiableCredential` /
  `VerifiablePresentation` types, and TypeScript types for the whole API
  exported from the package entry.
- Package `exports` add the `./openbadges` subpath and `react-native` / `import`
  conditions, and the package is marked `sideEffects: false`.

### Removed

- The `knownDIDRegistries` and `reloadIssuerRegistry` options.
- The 1.x result fields `credential`, `errors`, `log` and
  `additionalInformation`, and `presentationResult` on presentations.
- The `@digitalcredentials/issuer-registry-client` dependency.

## 1.0.0-beta.11 - December 15 2025

### Added

- Returns staus list errors that had been incorrectly swallowed. See the README
  for new errors that are returned.

## 1.0.0-beta.10 - October 24 2025

### Added

- Returns more informative results for json-ld safe-mode errors. See the README
  for details.

## 1.0.0-beta.9 - October 2 2025

### Added

- Adds schema validation results to the returned verification results.
