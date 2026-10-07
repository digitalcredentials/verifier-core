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
  `RealTimeService()`). Available on `VerificationContext.timeService` to any
  check that needs to ask "what time is it?": `proof.signature` judges
  credential validity dates against it and `status.bitstring` judges status-list
  freshness against it, so a verifier built on a `FakeTimeService` decides both
  at the pinned moment. Signature clock-skew and key rotation are still ahead.
- `CREDENTIAL_EXPIRED` and `CREDENTIAL_NOT_YET_VALID` on `ProblemTypes`, under
  the same URI namespace as the other synthesized types.
- `VERIFICATION_METHOD_ERROR` on `ProblemTypes`, under the same URI namespace.
  Reported by `proof.signature` when the proof's verification method cannot be
  found, its controller has not authorized it for the proof purpose, or the
  credential's issuer is not that controller.
- Optional `now?: Date` on `CryptoVerifyOptions`, filled by the calling check
  from the verification context's `TimeService` and passed through to
  `@digitalcredentials/vc` by `DataIntegrityCryptoService`. Custom
  `CryptoService` implementations may ignore it; omitting it means "now" as the
  adapter's own library sees it.
- `RegistryCheckPayload` on the `registry.issuer` outcome, on success and on
  failure alike: `matches`, one per registry that listed the issuer, each
  `{ registry: { name, type, url? }, entity? }`, and `uncheckedRegistries`,
  each `{ name, type, url? }`. The registry's `url` is where it is read from —
  the list URL for `dcc-legacy` and `vc-recognition`, the trust anchor's entity
  configuration for `oidf`. The lookup stops at the first registry that
  matches, so `matches` normally holds at most one entry; only a lookup run
  with `exhaustive` returns more. The outcome's `message` is unchanged, and is
  display text only — read the payload rather than parsing it.
- `RegistryEntity` on a match: the registry's own record of the issuer
  (`name`, `url`, `logo`, and the untouched registry entry as `raw`). Because
  it comes from the registry rather than from the credential, it is the display
  name to prefer. The `dcc-legacy` and `oidf` handlers fill it in;
  `vc-recognition` entities are still to come. For `oidf` it is the `metadata`
  of the trust anchor's subordinate statement — `name` from
  `federation_entity.organization_name`, `url` from `homepage_uri`, `logo` from
  `logo_uri`, and the whole verified `metadata` as `raw` — read only from a
  statement that has just verified, on a cache hit as well as on a fresh fetch.
  An OIDF `logo_uri` may be a `data:` URI holding the image itself rather than
  a link to it, so `entity.logo` can be large, and it is cached along with the
  rest of the lookup.
- `payload?: unknown` on `failure` outcomes of `CheckOutcome`. Additive —
  `success` already allowed one.
- `RegistryCheckPayload`, `RegistryMatch`, `RegistryReference`,
  `RegistryEntity` and `HandlerResult` are exported from the package entry, so
  a custom handler passed via `registryHandlers` can return an `entity` on its
  `found` result and have the lookup pass it through.
- `domain` on `verifyPresentation`, checked alongside `challenge`.
- `BuiltinHttpGetService({ timeoutMs, maxBytes })`: the deadline (default 10 s)
  and body cap (default 5 MB) of the built-in HTTP service.

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
- **`RegistryLookupResult` carries `matches` and registry references in place
  of its lists of names.** `matchingRegistries: string[]` is replaced by
  `matches: RegistryMatch[]`, and `uncheckedRegistries: string[]` by
  `uncheckedRegistries: RegistryReference[]`. A lookup result cached in the old
  shape — one with no `matches` array — is treated as a cache miss, not an
  error: the issuer is looked up again and the new shape is cached over it. No
  cache needs clearing on upgrade.
- `HttpGetResult.body` from the built-in HTTP service is parsed JSON whenever
  the body is valid JSON, whatever its content type. Previously only JSON
  content types were parsed, so a `text/plain` status list or DID document
  arrived as a string.

### Fixed

- **A key or controller mismatch is no longer reported as `INVALID_SIGNATURE`
  with the detail "Verification error(s).", exactly what a tampered credential
  reported.** A verification method that is missing, unauthorized by its
  controller for the proof purpose, or controlled by someone other than the
  issuer now fails with `VERIFICATION_METHOD_ERROR` ("Verification Method
  Error"): the issuer's key setup is wrong, which is not the same accusation as
  "the content was altered". Still fatal.
- **A failed signature check now reports the signature library's own message.**
  Every failure took its `detail` from the `VerificationError` wrapper
  ("Verification error(s).") rather than from the errors it wraps; a tampered
  credential now reads "Invalid signature.".
- **An expired or not-yet-valid credential is no longer reported as
  `INVALID_SIGNATURE` / "Invalid Signature", the same verdict as a forgery.**
  `@digitalcredentials/vc` reads validity dates only after the proof verifies,
  so a date failure is positive evidence the credential is authentic.
  `proof.signature` now reports `CREDENTIAL_EXPIRED` ("Credential Expired") when
  `validUntil` / `expirationDate` has passed, and `CREDENTIAL_NOT_YET_VALID`
  ("Credential Not Yet Valid") when `validFrom` / `issuanceDate` is still in the
  future. Both remain fatal, and expiry remains part of the proof check.
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
- Verifiable presentation `holder` now accepts an object with an `id` as well as
  a URL string, per VCDM 2.0 (supersedes upstream #22).
- **Security: `unsignedPresentation: true` no longer skips a presentation proof
  that is present.** The flag was forwarded to `@digitalcredentials/vc`, which
  reads it as "skip the presentation proof", so a VP with a tampered holder
  signature verified whenever the caller set it. A proof that is present is now
  always verified. The flag only accepts a VP that has no proof, and that VP's
  `proof.signature` is `skipped` rather than failing with "No Applicable Crypto
  Service". Without the flag, a VP with no proof fails `proof.signature` as
  `Presentation Not Signed`. `CryptoVerifyOptions` no longer carries
  `unsignedPresentation`, because a `CryptoService` is only asked to verify
  proofs that exist.
- **Security: a supplied `challenge` is now always enforced.** Previously a VP
  whose proof claimed `assertionMethod` was verified without checking it, so a
  replayed presentation verified. With no challenge supplied, an
  `authentication` VP now verifies on its signature instead of failing against
  the placeholder challenge `meaningless`. The VP proof check no longer
  re-verifies embedded credentials.
- **Security: the built-in HTTP service no longer fetches whatever a credential
  names.** It refuses non-https URLs, `localhost` and loopback, private,
  link-local and unspecified IP literals, on the first URL and on every redirect
  hop (at most five). Each request has a 10 s deadline and a 5 MB body cap. The
  body is read once, so a malformed JSON response no longer fails with
  `Body is unusable`, and errors name only the URL and the reason: response text
  no longer reaches problem details. This covers the built-in service only; an
  injected `httpGetService` or `documentLoader` keeps its own policy.
- **Security: OIDF registry membership is now verified.** Previously both entity
  statements were payload-decoded without checking their signatures, and any
  statement with a `metadata` object counted as registered. The trust anchor's
  entity configuration and the issuer's subordinate statement are now
  signature-verified (ES256 or EdDSA), with `iss`, `sub` and `exp` checked; a
  statement that does not verify reports the registry as unchecked. OIDF lookups
  now work in browsers and React Native (no `Buffer`). A lookup that included an
  unreachable registry is cached for 60 s instead of 1 h, and a recognition
  credential for at most 1 h instead of until its `validUntil`. `registries: []`
  skips the registry check instead of reporting the issuer as not registered.
  When every registry is unchecked, the result says registration could not be
  determined (`REGISTRY_UNCHECKED` only). dcc-legacy lookups ignore prototype
  keys such as `__proto__`, and registry cache keys can no longer collide.
- **The OBv3 schema check no longer fetches and compiles its schema on every
  verification.** The four published OB 3.0 schemas are now fetched once per
  `cacheService` (cached for 24 h under `schema:<url>`) and compiled once per
  verifier, so verifiers that share a `cacheService` share the fetch. Only a
  successfully fetched JSON object is cached. Any other `credentialSchema` URL
  is still fetched and compiled on every verification, so an issuer cannot grow
  the cache. The docs previously claimed the schema was cached after first use;
  it was not.
- **Security: a status list signed by someone other than the credential's issuer
  is now reported.** Previously a validly signed status list from any DID
  decided revocation without any signal, so whoever controlled the list's host
  could un-revoke a credential by serving a list signed with their own key. A
  new non-fatal check, `status.list-issuer`, runs after `status.bitstring` and
  reports `STATUS_LIST_ISSUER_MISMATCH` when a list's `issuer` id differs from
  the credential's. It is a warning, so `verified` is unchanged: some status
  services sign every list with a DID of their own rather than the issuer's.
  Consumers that need the binding enforced should treat
  `STATUS_LIST_ISSUER_MISMATCH` as decisive. Each status list is still fetched
  once per verification. The crypto service no longer passes
  `verifyMatchingIssuers` to `@digitalcredentials/vc`, which never read it. The
  status check also now checks every `BitstringStatusListEntry` for `revocation`
  or `suspension`, not only the first `credentialStatus` entry, and ignores
  other entries (legacy types, unknown types, other purposes) without fetching
  their lists; a set `refresh` or `message` bit no longer reads as revoked. Each
  set bit is its own problem, `CREDENTIAL_REVOKED` or `CREDENTIAL_SUSPENDED`,
  which replace `CREDENTIAL_REVOKED_OR_SUSPENDED`. An expired or not-yet-valid
  status list is reported as `STATUS_LIST_EXPIRED` or
  `STATUS_LIST_NOT_YET_VALID` instead of as a bad signature, and a list that is
  not a `BitstringStatusListCredential` as `STATUS_LIST_TYPE_ERROR`; neither
  classification could fire before.
- **"Issuer not registered" no longer claims every registry was checked.** When
  an issuer was not found but some registries could not be reached (for example,
  a registry that sends no CORS headers, read from a browser),
  `ISSUER_NOT_REGISTERED` said the issuer "was not found in any known DID
  registry". It now says how many registries answered — "was not found in the 5
  registries that could be checked; 4 could not be checked." The
  `REGISTRY_UNCHECKED` problem that names the unreachable registries, and the
  success message, are unchanged.

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
- **Registry matches.** 1.x returned the registry's record of the issuer at the
  top level of the verification result, as `matchingIssuers[]`, each
  `{ issuer: { federation_entity: { organization_name, homepage_uri, logo_uri?,
  … } }, registry: { name, type, url } }`. 2.0 returns the same information as
  the `payload` of the `registry.issuer` check's outcome, a
  `RegistryCheckPayload` whose `matches[]` entries are
  `{ registry: { name, type, url? }, entity? }`. What 1.x called `issuer`
  (its `federation_entity`) is now `entity`:

  | 1.x | 2.0 |
  |-----|-----|
  | `matchingIssuers[]` | `payload.matches[]` |
  | `…issuer.federation_entity.organization_name` | `…entity.name` |
  | `…issuer.federation_entity.homepage_uri` | `…entity.url` |
  | `…issuer.federation_entity.logo_uri` | `…entity.logo` |
  | `…registry` | `…registry` (`name`, `type`, `url`) |

  The whole registry entry is also available, unmodified, as `entity.raw`:
  for `oidf` that is the verified subordinate statement's whole `metadata`,
  which is where 1.x read `issuer` from. `dcc-legacy` and `oidf` registries
  populate `entity`; `vc-recognition` does not yet. Because folding drops
  successes from `results[]`, reading the payload of a *passing*
  `registry.issuer` needs `verbose: true`.
- **Reading registry names out of the message.** Code that parsed the
  `registry.issuer` message — "Issuer found in registry: A. 1 registries could
  not be checked: B" — should read `payload.matches[].registry.name` and
  `payload.uncheckedRegistries[].name` instead. The message is unchanged, but
  it joins names with `, `, so a registry whose own name contains `, ` cannot
  be recovered from it.
- **Custom `LookupIssuers` or `registryHandlers`.** A custom `LookupIssuers`
  must now return `matches: RegistryMatch[]` rather than
  `matchingRegistries: string[]`, and `uncheckedRegistries` as references
  rather than names. A custom handler's `found` result is unchanged unless it
  wants to supply an `entity`, which is optional.

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
