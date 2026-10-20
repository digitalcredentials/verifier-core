# Verification results

> Consumer reference for `CredentialVerificationResult` and
> `PresentationVerificationResult`. Covers the `results[]` array, the
> `id` namespace, the `SuiteSummary` rollup (new in v2.0.0), and a UI
> rendering recipe.
>
> **Audience.** UI and integration teams building on top of
> `verifier-core`.
>
> **See also.** For per-check / per-suite / per-call timing data
> on every result, see [`timing.md`](./timing.md).

## Table of Contents

1. [Overview](#overview)
   - [The top-level verdict](#the-top-level-verdict)
   - [Check payloads](#check-payloads)
2. [Presentation vs credential scopes](#presentation-vs-credential-scopes)
3. [Phase model](#phase-model)
4. [`SuiteSummary` reference](#suitesummary-reference)
5. [`id` namespace reference](#id-namespace-reference)
6. [UI rendering recipe](#ui-rendering-recipe)
7. [Backwards compatibility](#backwards-compatibility)

## Overview

`results[]` carries **every** check: the ones that passed, the ones that
were skipped (with the reason), and the ones that were not run because an
earlier fatal failure halted the pipeline (see
[Fatal failures and `verified`](#fatal-failures-and-verified) for the two
fatal checks that do not halt). `summary[]`, new in v2.0.0, is the per-suite
rollup over those rows.

### The top-level verdict

`verified` is `true` when no **fatal** check failed. For a presentation it
also requires every embedded credential to be `verified`.

Some checks are **advisory** (non-fatal), and an advisory failure never
flips `verified`:

- `trust.registry.issuer`
- `recognition.profile`
- `cryptographic.status.list-issuer`
- the Open Badges checks — the semantic `schema.obv3.*` checks and the
  Open Badges JSON-schema check
- any caller-supplied check that leaves `fatal` unset

So a credential whose only failing check is the registry lookup is
`verified: true`, while its `trust.registry` summary has
`status: 'failure'` and no `fatalFailureAt`. A UI that wants to show
"issuer not registered" reads the summary rows, not `verified`; see
[§6 UI rendering recipe](#ui-rendering-recipe).

A successful single-credential verification:

```jsonc
{
  "verified": true,
  "verifiableCredential": { "...the credential you passed in, unchanged..." },
  "results": [
    { "id": "cryptographic.core.context-exists",
      "suite": "core",
      "outcome": { "status": "success", "message": "..." },
      "fatal": true },
    { "id": "cryptographic.core.vc-context",      /* success */ },
    { "id": "cryptographic.core.vc-structure",    /* success */ },
    { "id": "cryptographic.core.credential-id",   /* success */ },
    { "id": "cryptographic.core.proof-exists",    /* success */ },
    { "id": "recognition.profile",
      "suite": "recognition",
      "outcome": { "status": "skipped",
                   "reason": "no recognizer matched" } },
    { "id": "cryptographic.proof.signature",      /* success */ },
    { "id": "cryptographic.proof.validity-period", /* success */ },
    { "id": "cryptographic.status.bitstring",
      "suite": "status",
      "outcome": { "status": "skipped",
                   "reason": "Credential has no credentialStatus." } },
    { "id": "cryptographic.status.list-issuer",
      "suite": "status",
      "outcome": { "status": "skipped",
                   "reason": "No status list was checked." } },
    { "id": "trust.registry.issuer",
      "suite": "registry",
      "outcome": {
        "status": "success",
        "message": "Issuer found in registry: DCC Sandbox Registry",
        "payload": {
          "matches": [
            { "registry": { "name": "DCC Sandbox Registry", "type": "dcc-legacy",
                            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json" },
              "entity": { "name": "Example University", "url": "https://example.edu",
                          "raw": { "name": "Example University", "url": "https://example.edu" } } }
          ],
          "uncheckedRegistries": []
        }
      },
      "fatal": false }
  ],
  "summary": [
    { "id": "cryptographic.core",     "phase": "cryptographic",
      "suite": "core",     "status": "success",
      "message": "5 of 5 checks passed",
      "counts": { "passed": 5, "failed": 0, "skipped": 0 } },
    { "id": "recognition",            "phase": "recognition",
      "suite": "recognition", "status": "skipped",
      "message": "1 of 1 check skipped",
      "counts": { "passed": 0, "failed": 0, "skipped": 1 } },
    { "id": "cryptographic.proof",    "phase": "cryptographic",
      "suite": "proof",   "status": "success",
      "message": "2 of 2 checks passed",
      "counts": { "passed": 2, "failed": 0, "skipped": 0 } },
    { "id": "cryptographic.status",   "phase": "cryptographic",
      "suite": "status",  "status": "skipped",
      "message": "2 of 2 checks skipped",
      "counts": { "passed": 0, "failed": 0, "skipped": 2 } },
    { "id": "trust.registry",         "phase": "trust",
      "suite": "registry","status": "success",
      "message": "1 of 1 check passed",
      "counts": { "passed": 1, "failed": 0, "skipped": 0 } }
  ]
}
```

Render from `summary[]` and lazy-expand into `results[]`: the rollup is
one row per suite, which is the shape a UI wants, and the detail rows are
there whenever a user asks for them.

### Check payloads

A `success` or `failure` outcome may carry a check-specific `payload` —
what the check learned, as data. Today only `registry.issuer` emits one,
a `RegistryCheckPayload`: the registries that listed the issuer (each
with the registry's `name`, `type` and `url`, and the registry's own
record of the issuer under `entity`), and the registries that could not
be checked. It is present on success and on failure alike, whenever the
lookup ran.

Read the payload rather than parsing the outcome's `message`: the message
is display text, and joins registry names with `, `, so a registry whose
own name contains `, ` cannot be recovered from it. `entity` is the
registry's description of the issuer rather than the credential's
description of itself, which makes it the display name to prefer.

Matches from every registry type carry an `entity`. For `oidf` it is the
`metadata` of the trust anchor's subordinate statement — `name` from
`federation_entity.organization_name`, `url` from `homepage_uri`, `logo`
from `logo_uri`, and the whole verified `metadata` under `raw` — read only
from a statement that has just verified, on a cache hit as well as on a
fresh fetch. Note that an OIDF `logo_uri` may be a `data:` URI carrying
the image itself rather than a link to it, so `entity.logo` can be large,
and it is cached along with the rest of the lookup.

For `vc-recognition` it is the recognition credential's
`credentialSubject` entry naming the issuer — `name`, `url` and `logo`
from the entry's members of those names, and the whole entry under `raw` —
read only from a credential that has verified, on a cache hit as well as
on a fresh fetch. Each of the three is set only where the entry's value is
a string, so an entry whose `name` is a language map carries no
`entity.name`; that value, and anything else the entry holds such as an
`image`, remains readable through `raw`.

The payload rides on the `registry.issuer` row in `results[]` whether the
check passed or failed, so a consumer reading registry matches does not
have to treat the two cases differently.

## Presentation vs credential scopes

`verifyPresentation` returns **both** a `presentationResults` array and a
`credentialResults` array. `presentationResults` holds **VP-level**
checks (the presentation envelope’s structure and proof/signature, and any suite whose
`applies` accepts a `verifiablePresentation`). `credentialResults` has
**one entry per embedded verifiable credential**, each with its own
`results` and `summary` for per-credential phases (structural/core,
recognition, per-credential proof and status, registry, and other
VC-scoped suites).

A `verifyPresentation(...)` result carries **two distinct scopes** of
verification, plus a derived top-level verdict. Knowing where to look
for what makes the difference between "the presentation envelope was
tampered with" and "one of the embedded credentials was revoked".

| Scope | Lives on | Suites that contribute | How `verified` aggregates |
|-------|----------|------------------------|---------------------------|
| Presentation-only | `result.presentationResults`, `result.summary` | `coreSuite` (only `core.vp-structure` applies to a VP) and `proofSuite`, each run **once** against the VP envelope itself, plus any `additionalSuites` whose `applies` accepts a `verifiablePresentation` subject | — (see top-level row) |
| Per credential | `result.credentialResults[i].results`, `result.credentialResults[i].summary` | `core`, `recognition`, `proof`, `status`, `registry` (defaults) plus any `additionalSuites` whose `applies` accepts the VC subject | `credentialResults[i].verified === no fatal failures across the per-credential checks` |
| Top-level | `result.verified` | derived | `presentationResults` has no fatal failures **AND** every `credentialResults[i].verified` is true |

When verifying a VP, `cryptographic.proof.signature` runs once at the VP
level (against the VP’s own proof) and once per embedded VC (against each
VC’s proof). Consumers **must** distinguish these by where the result
appears — `presentationResults` vs the matching
`credentialResults[i].results` — not by the check id alone.

### The two `cryptographic.proof.signature` checks

The same check id, `cryptographic.proof.signature`, can appear in
**both** `presentationResults` and `credentialResults[i].results` — and
they verify **different artifacts**:

- In `presentationResults`: the **holder's** signature on the VP
  envelope (typically `proofPurpose: 'authentication'`).
- In `credentialResults[i].results`: the **issuer's** signature on
  embedded VC `i` (typically `proofPurpose: 'assertionMethod'`).

A failure in one does not imply a failure in the other. A VP with a
broken holder signature can still contain perfectly valid VCs; a VP
with a valid holder signature can still contain a credential whose
issuer's signature is invalid.

### One iterable view: `flattenPresentationResults`

When you want a single flat array of every check that ran — VP-level
plus all embedded-VC-level — use `flattenPresentationResults(result)`.
It is re-exported from the package barrel (`src/index.ts`). It returns a
`FlattenedCheckResult[]` where each entry tags scope provenance via a
`source` field (`'presentation'` vs `'credential'`, with `credentialIndex`
when the row comes from an embedded credential):

```ts
type FlattenedCheckResult =
  | { source: 'presentation'; result: CheckResult }
  | { source: 'credential'; credentialIndex: number; result: CheckResult };
```

Reach for `flattenPresentationResults` when you don't care about scope
(e.g., a debug dump of every problem). Stick with the structured
`presentationResults` / `credentialResults[i].results` split for any
UI that needs to attribute failures to either the VP or a specific
embedded credential.

## Phase model

Every built-in suite carries a `phase` tag from
`SuitePhase = 'cryptographic' | 'trust' | 'recognition' | 'semantic'`.
Suites without a `phase` tag are reported as `'unknown'` on
`SuiteSummary.phase` (a separate type, `SuiteSummaryPhase`).

| Phase | Default suites | Opt-in suites |
|-------|----------------|---------------|
| `cryptographic` | `core`, `proof`, `status` | — |
| `trust` | `registry` | — |
| `recognition` | `recognition` | — |
| `semantic` | — | `openBadgesSuite`, `openBadgesSemanticSuite`, `openBadgesSchemaSuite` (via `/openbadges` submodule) |
| `unknown` | — | any caller-supplied suite without a `phase` tag |

The phase is the natural top-level grouping for a UI. See
[§6 UI rendering recipe](#ui-rendering-recipe). For two-pass
verification (running only a subset of phases), see the README's
[Credential recognition + two-pass verification](../../README.md#advanced-credential-recognition--two-pass-verification).

A credential's `recognizedProfile` (when set) tells the UI _what_ the
credential is at the recognition phase — e.g. `'obv3p0.openbadge'` —
distinct from the recognition suite's verified outcome. See the
README's recognition section.

## `SuiteSummary` reference

```ts
interface SuiteSummary {
  /** Dot-separated id mirroring CheckResult.id without a check segment. */
  id: string;
  /** Suite's declared phase, or 'unknown' when untagged. */
  phase: SuiteSummaryPhase;       // SuitePhase | 'unknown'
  /** Suite id (matches VerificationSuite.id). */
  suite: string;
  /** Computed from counts alone; says nothing about whether a failure was fatal. */
  status: 'success' | 'failure' | 'skipped' | 'mixed';
  message: string;
  counts: { passed: number; failed: number; skipped: number };
  /**
   * The fully-qualified id of the first check in this suite that
   * failed fatally, if one did. Every suite that carries it is a
   * reason the subject is not verified; more than one can.
   */
  fatalFailureAt?: string;
}
```

### `message` format

| Scenario | Format |
|----------|--------|
| All pass | `"<n> of <n> checks passed"` |
| All skipped | `"<n> of <n> checks skipped"` |
| Failures only | `"<n> of <m> checks failed"` |
| Mixed | `"<n> of <m> checks failed (<k> passed)"` |
| Fatal short-circuit | `"<n> of <m> checks failed (<k> passed, <r> not run after fatal)"` (either tail clause may be omitted when zero; a fatal check that does not halt leaves no not-run rows, so it reads like "Failures only" or "Mixed") |
| Halted by an earlier suite's fatal failure | `"<suite-id> not run: <check-id> failed"` |
| Explicit `applies` skip | `"<suite-id> not applicable: <reason>"` |

> "Not run" rows are the `skipped` results `runSuites` emits, with reason
> `"Not run: <check-id> failed"`, for checks halted by a halting fatal failure. They
> count toward `counts.skipped` but not toward the "skipped" wording: the
> message reports them as "not run after fatal" instead.

> Singular `check` is used when `n === 1`.

### `status` values

| `status` | Meaning |
|----------|---------|
| `success` | Every check that ran in this suite passed |
| `failure` | At least one check failed and none passed (skips allowed) |
| `mixed`   | At least one check failed and at least one passed |
| `skipped` | No check in this suite ran |

`status` is computed from `counts` alone. It does not say whether a
failure was fatal: a suite whose only failure is a non-fatal check
(for example `trust.registry.issuer`) has `status: 'failure'` inside a
result whose `verified` is still `true`.

### Fatal failures and `verified`

A fatal failure makes `verified` false. Most fatal checks also **halt**:
every later check for the subject is reported as not run. Two built-in
fatal checks do not halt, because by the time they run the credential is
known to be authentic, and what the later checks say still matters:

- `cryptographic.proof.validity-period` — expired or not yet valid. The
  credential's status, list issuer and registry membership are still
  reported.
- `cryptographic.status.bitstring` — revoked, suspended, or its status
  list could not be trusted. The list issuer and registry membership are
  still reported.

A check marks this with `halts: false` alongside `fatal: true`, which a
caller-supplied check can do too; the row carries `halts: false` as well.
So a subject can have more than one fatal failure, and more than one of
its summaries can carry `fatalFailureAt` — an expired, revoked credential
has both `proof` and `status`. The invariant to rely on:

> A credential's `verified` is `false` exactly when any of its
> `summary[]` entries has `fatalFailureAt`.

The same holds for a presentation's own checks and its `summary[]`; the
presentation's `verified` additionally requires every
`credentialResults[i].verified`.

There is deliberately no per-suite `verified`: the only verdicts are
the result-level `verified` fields.

### Per-suite badge recommendations

Colour a suite by `fatalFailureAt` first and `status` second, so a
non-fatal failure never reads as red inside a verified credential:

| Condition | Glyph | Color | Meaning |
|-----------|-------|-------|---------|
| `fatalFailureAt` is set | ✗ | red | This suite's failure is why the subject is not verified |
| `status` is `failure` or `mixed`, no `fatalFailureAt` | ⚠ | amber | Warning: a non-fatal check failed; `verified` is unaffected |
| `status === 'success'` | ✓ | green | Every check that ran passed |
| `status === 'skipped'` | — | gray | Nothing ran (not applicable, or halted by an earlier halting fatal failure) |

## `id` namespace reference

Every `CheckResult` has an `id` of the form
`<phase>.<suite>.<localPart>` — the suite runner sets it on every row
it emits, so it is always there. Every `SuiteSummary` has the matching
`<phase>.<suite>` prefix (no trailing local part).

> **Stable for 2.x.** Check ids and the built-in suites' `phase` tags
> are API. Because an id embeds its suite's phase, re-tagging a
> built-in suite renames every check in it — so changing either a
> check id or a built-in phase tag is a breaking change, not a
> refactor.

Every id the default suites, the parse-failure path and the
`/openbadges` suites can produce:

```
cryptographic.core
  cryptographic.core.context-exists
  cryptographic.core.vc-context
  cryptographic.core.vc-structure
  cryptographic.core.vp-structure                (presentations only)
  cryptographic.core.credential-id
  cryptographic.core.proof-exists
cryptographic.proof
  cryptographic.proof.signature
  cryptographic.proof.validity-period            (credentials only)
cryptographic.status
  cryptographic.status.bitstring
  cryptographic.status.list-issuer
trust.registry
  trust.registry.issuer
recognition
  recognition.profile
cryptographic.parsing                           (parse failures only)
  cryptographic.parsing.envelope
semantic.openbadges                             (openBadgesSuite)
  semantic.openbadges.applies
  semantic.openbadges.schema.obv3.result-ref
  semantic.openbadges.schema.obv3.achieved-level
  semantic.openbadges.schema.obv3.missing-result-status
  semantic.openbadges.schema.obv3.unknown-achievement-type
  semantic.openbadges.schema.obv3.json
semantic.openbadges.semantic                    (openBadgesSemanticSuite)
  semantic.openbadges.semantic.applies
  semantic.openbadges.semantic.schema.obv3.result-ref
  semantic.openbadges.semantic.schema.obv3.achieved-level
  semantic.openbadges.semantic.schema.obv3.missing-result-status
  semantic.openbadges.semantic.schema.obv3.unknown-achievement-type
semantic.openbadges.schema                      (openBadgesSchemaSuite)
  semantic.openbadges.schema.applies
  semantic.openbadges.schema.schema.obv3.json
```

The three `*.applies` rows appear only when the suite was queued
explicitly via `additionalSuites` and its predicate rejected the
credential, or when that predicate threw; see rule 5 below. A suite
supplied by a consumer without a `phase` tag produces ids beginning
`unknown.` (e.g. `unknown.my-suite.my-check`).

### Computation rules

`computeId(phase, suite, localCheckId)` (also exported from the
package barrel) builds these strings. Rules:

1. **Suite-prefix dedupe.** If `localCheckId` starts with `<suite>.`,
   strip it. (`computeId('cryptographic', 'core', 'core.proof-exists')`
   → `cryptographic.core.proof-exists`.)
2. **Phase-equals-suite collapse.** When `phase === suite`, emit a
   single `<phase>.<localPart>` instead of `<phase>.<phase>.<localPart>`.
   (`computeId('recognition', 'recognition', 'recognition.profile')`
   → `recognition.profile`.)
3. **Untagged suites.** When the suite has no `phase`, the segment
   becomes `'unknown'`.
4. **Suite summaries.** Pass `localCheckId === ''` to drop the
   trailing segment. (`computeId('cryptographic', 'core', '')` →
   `cryptographic.core`.)
5. **Synthetic `applies` skips.** A suite whose `applies` predicate
   returns false against an explicitly-queued credential emits a
   single `CheckResult` with check id `<suite>.applies`, producing
   `<phase>.<suite>.applies` (e.g. `semantic.openbadges.applies`).
6. **Parse errors.** A parse failure produces one summary entry at
   `cryptographic.parsing` plus one detail row at
   `cryptographic.parsing.envelope`.

Two consequences worth remembering when consuming:

- **A summary's children always start with `summary.id + '.'`.**
  Filter `cr.results` with that prefix to find the detail rows for a
  given summary entry; narrow by `outcome.status` when you want only the
  failures, since passes and skips share the prefix. (See §6 step 3.)
- **Suite ids do not need to match phases.** The OB suites all live
  under phase `'semantic'`, but their checks still carry their
  authored ids (e.g. `schema.obv3.result-ref`), so the resulting ids
  read `semantic.openbadges.schema.obv3.result-ref`. Long, but
  prefix-stable.

## UI rendering recipe

```ts
import type {
  CredentialVerificationResult,
  PresentationVerificationResult,
  SuiteSummary,
} from '@digitalcredentials/verifier-core';

const PHASE_ORDER: SuiteSummary['phase'][] = [
  'cryptographic',
  'trust',
  'recognition',
  'semantic',
  'unknown',
];

// 1. Top-level verdict (presentation case)
function verdict(result: PresentationVerificationResult) {
  const verifiedCount = result.credentialResults.filter(c => c.verified).length;
  const totalCount = result.credentialResults.length;
  return {
    overall: result.verified,
    label: `${verifiedCount} of ${totalCount} credentials verified`,
  };
}

// 2. Per-credential summaries grouped by phase
function groupByPhase(cr: CredentialVerificationResult) {
  const groups = new Map<SuiteSummary['phase'], SuiteSummary[]>();
  for (const phase of PHASE_ORDER) groups.set(phase, []);
  for (const s of cr.summary) groups.get(s.phase)!.push(s);
  return groups;
}

// 3. For a failing phase row, find detail (the failure CheckResult entries).
//    `results[]` holds passes and skips under the same prefix, so filter
//    by status as well.
function failureDetail(
  cr: CredentialVerificationResult,
  failing: SuiteSummary,
) {
  return cr.results.filter(
    r => r.id.startsWith(failing.id + '.') && r.outcome.status === 'failure',
  );
}

// 4. Recognized profile label (from the recognition pipeline)
function profileLabel(cr: CredentialVerificationResult) {
  return cr.recognizedProfile; // e.g. 'obv3p0.openbadge', or undefined
}

// 5. Badge for one suite (or the worst of a phase's suites).
//    Check `fatalFailureAt` before `status`: a non-fatal failure is a
//    warning, not an error.
type Badge = 'error' | 'warning' | 'ok' | 'none';
function suiteBadge(s: SuiteSummary): Badge {
  if (s.fatalFailureAt !== undefined) return 'error';
  if (s.status === 'failure' || s.status === 'mixed') return 'warning';
  return s.status === 'success' ? 'ok' : 'none';
}
```

A presentation with two credentials — the first failing only advisory
checks, the second failing a fatal one — gets rendered as:

```
Presentation: ✗ (1 of 2 credentials verified)
├─ VP signature: ✓
├─ Credential 1 (obv3p0.openbadge): ✓   — verified, with advisory failures
│   ├─ cryptographic ✓ (4 + 2 + 1 = 7 checks passed)
│   ├─ trust         ⚠ (1 of 1 check failed — advisory)
│   │   └─ trust.registry.issuer — Issuer Not Registered
│   ├─ recognition   ✓
│   └─ semantic      ⚠ (1 of 5 checks failed, 4 passed — advisory)
│       └─ semantic.openbadges.schema.obv3.result-ref — Invalid Result Reference
└─ Credential 2 (obv3p0.openbadge): ✗
    ├─ cryptographic ✗ (1 of 1 check failed)
    │   └─ cryptographic.proof.signature — Invalid Signature
    ├─ trust         — (not run after fatal)
    ├─ recognition   ✓
    └─ semantic      — (not run after fatal)
```

Credential 1 shows the rule from
[§1 The top-level verdict](#the-top-level-verdict): the registry and
Open Badges checks are advisory, so their failures leave
`credentialResults[0].verified === true` even though those two suites
report `status: 'failure'` and `'mixed'`. Neither carries
`fatalFailureAt`, so they render as warnings (amber), not errors. Only
credential 2's fatal signature failure makes the presentation's own
`verified` false. A UI that hid advisory failures because the verdict
was `true` would be hiding exactly what a user wants to know, so render
them — just not as a failed verdict. A phase takes the most severe
badge of its suites.

The `└─` rows under each failing phase row come from `failureDetail()`.
Lazy-expand them — most users only want the verdict + per-phase status.

## Backwards compatibility

- **Removed.** `CheckResult.check` is gone. Use `CheckResult.id`.
  `CheckResult.suite` stays: it is how rows are grouped, it matches
  `SuiteSummary.suite`, and it cannot be recovered from `id`, because
  a suite id may itself contain dots.
- **`flattenPresentationResults`** is unchanged. Use it as the "give me
  one array of every check" escape hatch when you don't want to walk
  `credentialResults[].results`.
- **Migration recipe for code that filtered/found by the removed
  `check` field, or by `suite`:** switch to `id` and prefix-matching
  against the summary
  rollup, narrowing by `outcome.status`. See §6 step 3 for the
  canonical pattern.
