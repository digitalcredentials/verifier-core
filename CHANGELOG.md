# @digitalcredentials/verifier-core CHANGELOG

## 2.0.0 - Month XX 2026

Verifier results now fold per-suite checks into a single
`summary: SuiteSummary[]` rollup; `results[]` carries only failures and explicit
`<suite>.applies` skips by default. The full check list remains available via
`verbose: true` on the verifier or per call.

### Added

- Default verification support for the `ecdsa-rdfc-2019` Data Integrity
  cryptosuite (Multikey; P-256 `zDna…` and P-384 `z82L…` did:key/did:web
  verification methods), wired via `@interop/ecdsa-signature` +
  `@interop/ecdsa-multikey`. `defaultCryptoSuites()` now registers three suites:
  Ed25519Signature2020, EdDSA RDFC-2022, and ECDSA RDFC-2019.
- `SuiteSummary` type and `summary: SuiteSummary[]` field on
  `CredentialVerificationResult` and `PresentationVerificationResult`.
- `id: string` field on `CheckResult` — dot-separated
  `<phase>.<suite>.<localPart>` namespace.
- `verbose?: boolean` on `VerifierConfig`, `VerifyCredentialCall`,
  `VerifyPresentationCall` (per-call wins over instance default;
  `verifyPresentation` propagates the flag to embedded credentials).
- Pure `foldCheckResults` helper and `computeId` namespace builder, both
  exported from the package barrel.
- New consumer doc at `docs/api/verification-results.md` covering the folded
  shape, the `id` namespace, a UI rendering recipe, and a prompt-ready appendix
  for downstream UIs.
- `timing?: boolean` flag on `VerifierConfig`, `VerifyCredentialCall`, and
  `VerifyPresentationCall`. When true, every `CheckResult`, every
  `SuiteSummary`, and every top-level
  `Credential|PresentationVerificationResult` carries a `timing: TaskTiming`
  field describing wall-clock start/end and monotonic duration. Mirrors the
  `verbose` flag's plumbing; per-call wins; propagates from `verifyPresentation`
  into embedded `verifyCredential` calls. See `docs/api/timing.md`.
- `TaskTiming` interface (`startedAt`, `endedAt`, `durationMs`, optional
  recursive `events`). The reserved `events` field is forward-compatible with
  future sub-event capture from inside a single check.
- `TimeService` interface plus `RealTimeService` and `FakeTimeService`
  factories. New optional `timeService` on `VerifierConfig` (defaults to
  `RealTimeService()`). Now available on `VerificationContext.timeService` for
  any future check that needs to ask "what time is it?" — useful groundwork for
  credential expiration, signature clock-skew, key rotation, and status-list
  freshness work.

### Changed

- **Default `results[]` shape**: failures + explicit `<suite>.applies` skips
  only. Pass `verbose: true` to restore the prior shape.
- `flattenPresentationResults` semantically unchanged; in folded mode the
  returned array is naturally smaller.
- **Status list credential proofs** are verified through the `cryptoServices`
  configured on `createVerifier`, not through a second, non-injectable suite
  list. Consumers who inject custom `CryptoService`s now get them applied to
  BitstringStatusListCredentials fetched during a status check as well as to
  presentation and credential proofs.
- **Tooling / packaging** (infrastructure aligned with
  `isomorphic-lib-template`, no library behavior change): build is a single-pass
  `tsc` under `moduleResolution: Bundler`; tests run on **vitest** (Node) +
  **playwright** (browser, replacing karma); lint/format on eslint flat config +
  prettier 3; package manager is **pnpm**. `engines.node` raised to `>=24`.
  `exports` now declare `react-native` / `import` conditions for `.` and
  `./openbadges`, and the package is marked `sideEffects: false`.

### Fixed

- **Valid credentials no longer fail as `INVALID_SIGNATURE` because the verifier
  rewrote them.** `verifyCredential` / `verifyPresentation` previously ran the
  suites against the Zod parse output rather than the document the issuer
  signed. Zod's `.passthrough()` does not extend into nested object schemas, so
  `IssuerObjectSchema` deleted every key on `issuer.image` except `id` and
  `type` — including `caption`, which Open Badges 3.0 §B.1.13 defines and real
  issuers populate. Dropping a signed key changes the canonicalized N-Quads and
  the proof check then fails. The parse result is now discarded and the caller's
  original object is verified and returned as `result.verifiableCredential`,
  which also fixes consumers that re-verify that field in a second pass.
- `issuer.image.type` accepts an array (`['Image']`) as well as a string. The
  previous string-only union failed the entire credential parse.

### Deprecated

- `CheckResult.check` and `CheckResult.suite` — use `CheckResult.id` instead.
  Removal target: the next major.

### Removed

- `cryptoSuites` and `verifyBitstringStatusListCredential` on
  `VerificationContext`. Both were `@internal` and neither was reachable through
  `VerifierConfig`, so only code constructing a `VerificationContext` directly
  (test helpers) is affected. Tests that used
  `verifyBitstringStatusListCredential: false` should inject a permissive
  `CryptoService` instead.

### Migration

- To restore the prior result shape with no other changes: pass `verbose: true`
  on the verifier or per call.
- To adopt the new shape: read `result.summary[]` for the per-suite rollup; read
  `result.results[]` for failure detail; use
  `r.id?.startsWith(summary.id + '.')` to find detail rows under a failing
  summary entry.

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
