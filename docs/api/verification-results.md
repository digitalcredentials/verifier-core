# Verification results

> Consumer reference for `CredentialVerificationResult` and
> `PresentationVerificationResult`. Covers result folding (default since
> v2.0.0), the `id` namespace, the `SuiteSummary` rollup, the verbose
> escape hatch, and a UI rendering recipe.
>
> **Audience.** UI/integration teams building on top of `verifier-core`,
> primarily `dcc-transaction-service`. The §9 prompt-ready appendix is
> written to be copy-pasted as the seed of an LLM prompt.
>
> **See also.** For per-check / per-suite / per-call timing data
> on every result, see [`timing.md`](./timing.md).

## Table of Contents

1. [Overview — folded vs verbose](#overview)
2. [Presentation vs credential scopes](#presentation-vs-credential-scopes)
3. [Phase model](#phase-model)
4. [`SuiteSummary` reference](#suitesummary-reference)
5. [`id` namespace reference](#id-namespace-reference)
6. [UI rendering recipe](#ui-rendering-recipe)
7. [Verbose mode](#verbose-mode)
8. [Backwards compatibility](#backwards-compatibility)
9. [Prompt-ready appendix](#prompt-ready-appendix)

## Overview

A successful single-credential verification, **folded** (the default
since v2.0.0):

```jsonc
{
  "verified": true,
  "verifiableCredential": { "...parsed credential..." },
  "results": [],                      // empty: no failures, no explicit skips
  "summary": [
    { "id": "cryptographic.core",     "phase": "cryptographic",
      "suite": "core",     "status": "success", "verified": true,
      "message": "4 of 4 checks passed",
      "counts": { "passed": 4, "failed": 0, "skipped": 0 } },
    { "id": "recognition",            "phase": "recognition",
      "suite": "recognition", "status": "skipped", "verified": true,
      "message": "1 of 1 check skipped",
      "counts": { "passed": 0, "failed": 0, "skipped": 1 } },
    { "id": "cryptographic.proof",    "phase": "cryptographic",
      "suite": "proof",   "status": "success", "verified": true,
      "message": "1 of 1 check passed",
      "counts": { "passed": 1, "failed": 0, "skipped": 0 } },
    { "id": "cryptographic.status",   "phase": "cryptographic",
      "suite": "status",  "status": "skipped", "verified": true,
      "message": "1 of 1 check skipped",
      "counts": { "passed": 0, "failed": 0, "skipped": 1 } },
    { "id": "trust.registry",         "phase": "trust",
      "suite": "registry","status": "success", "verified": true,
      "message": "1 of 1 check passed",
      "counts": { "passed": 1, "failed": 0, "skipped": 0 } }
  ]
}
```

The same verification with `verbose: true`:

```jsonc
{
  "verified": true,
  "verifiableCredential": { "...parsed credential..." },
  "results": [
    { "id": "cryptographic.core.context-exists",
      "suite": "core", "check": "core.context-exists",
      "outcome": { "status": "success", "message": "..." },
      "fatal": true },
    { "id": "cryptographic.core.vc-context",      /* ... */ },
    { "id": "cryptographic.core.credential-id",   /* ... */ },
    { "id": "cryptographic.core.proof-exists",    /* ... */ },
    { "id": "recognition.profile",                /* skipped: no recognizers configured */ },
    { "id": "cryptographic.proof.signature",      /* ... */ },
    { "id": "cryptographic.status.bitstring",     /* skipped: no credentialStatus */ },
    { "id": "trust.registry.issuer",              /* ... */ }
  ],
  "summary": [ /* identical to the folded summary above */ ]
}
```

## Presentation vs credential scopes

`verifyPresentation` returns **both** a `presentationResults` array and a
`credentialResults` array. `presentationResults` holds **VP-level**
checks (the presentation envelope’s proof/signature and any suite whose
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
| Presentation-only | `result.presentationResults`, `result.summary` | `proofSuite` (run **once** against the VP envelope itself) plus any `additionalSuites` whose `applies` accepts a `verifiablePresentation` subject | — (see top-level row) |
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
  status: 'success' | 'failure' | 'skipped' | 'mixed';
  /** Convenience: `status !== 'failure' && status !== 'mixed'`. */
  verified: boolean;
  message: string;
  counts: { passed: number; failed: number; skipped: number };
  /**
   * The fully-qualified id of the fatal check that short-circuited
   * the suite, if any. Absent when the suite ran to completion or
   * skipped without entering a fatal state.
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
| Fatal short-circuit | `"<n> of <m> checks failed (<k> passed, <r> not run after fatal)"` (either tail clause may be omitted when zero) |
| Explicit `applies` skip | `"<suite-id> not applicable: <reason>"` |

> Singular `check` is used when `n === 1`.

### Per-status badge recommendations

| `status` | Glyph | Color | Meaning |
|----------|-------|-------|---------|
| `success` | ✓ | green | Every check that ran in this suite passed |
| `failure` | ✗ | red   | Every check in this suite failed (or only failures + skips) |
| `mixed`   | ⚠ | amber | Both passes and failures in the same suite |
| `skipped` | — | gray  | Suite was acknowledged but produced no run checks |

`verified === false` iff `status === 'failure' || status === 'mixed'`. A
top-level `result.verified` is the AND of every credential's
`result.verified` AND no presentation-level fatal failures.

## `id` namespace reference

Every `CheckResult` has an `id` of the form
`<phase>.<suite>.<localPart>`. Every `SuiteSummary` has the matching
`<phase>.<suite>` prefix (no trailing local part). Built-in ids:

```
cryptographic.core
  cryptographic.core.context-exists
  cryptographic.core.vc-context
  cryptographic.core.credential-id
  cryptographic.core.proof-exists
cryptographic.proof
  cryptographic.proof.signature
cryptographic.status
  cryptographic.status.bitstring
trust.registry
  trust.registry.issuer
recognition
  recognition.profile
semantic.openbadges                             (openBadgesSuite)
  semantic.openbadges.schema.obv3.result-ref
  semantic.openbadges.schema.obv3.achieved-level
  semantic.openbadges.schema.obv3.missing-result-status
  semantic.openbadges.schema.obv3.unknown-achievement-type
  semantic.openbadges.schema.obv3.json
semantic.openbadges.semantic                    (openBadgesSemanticSuite)
  semantic.openbadges.semantic.schema.obv3.result-ref
  semantic.openbadges.semantic.schema.obv3.achieved-level
  semantic.openbadges.semantic.schema.obv3.missing-result-status
  semantic.openbadges.semantic.schema.obv3.unknown-achievement-type
semantic.openbadges.schema                      (openBadgesSchemaSuite)
  semantic.openbadges.schema.schema.obv3.json
```

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

- **A failing summary's children always start with `summary.id + '.'`.**
  Filter `cr.results` with that prefix to find the failure detail rows
  for a given summary entry. (See §6 step 3.)
- **Suite ids do not need to match phases.** The OB suites all live
  under phase `'semantic'`, but their checks still carry their
  authored ids (e.g. `schema.obv3.result-ref`), so the resulting ids
  read `semantic.openbadges.schema.obv3.result-ref`. Long, but
  prefix-stable.

## UI rendering recipe

Reproduces the layout described in
[`docs/plans/2026-04-18-suite-result-folding/00-ui-use-case.md`](../plans/2026-04-18-suite-result-folding/00-ui-use-case.md).

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

// 3. For a failing phase row, find detail (the failure CheckResult entries)
function failureDetail(
  cr: CredentialVerificationResult,
  failing: SuiteSummary,
) {
  return cr.results.filter(r => r.id?.startsWith(failing.id + '.'));
}

// 4. Recognized profile label (from the recognition pipeline)
function profileLabel(cr: CredentialVerificationResult) {
  return cr.recognizedProfile; // e.g. 'obv3p0.openbadge', or undefined
}
```

A presentation with two credentials where one passes and one fails
trust gets rendered as:

```
Presentation: ✗ (1 of 2 credentials verified)
├─ VP signature: ✓
├─ Credential 1 (obv3p0.openbadge): ✓
│   ├─ cryptographic ✓ (4 + 1 + 1 = 6 checks passed)
│   ├─ trust         ✓
│   ├─ recognition   ✓
│   └─ semantic      ✓ (5 of 5 checks passed)   [openBadgesSuite]
└─ Credential 2 (obv3p0.openbadge): ✗
    ├─ cryptographic ✓
    ├─ trust         ✗ (1 of 1 check failed)
    │   └─ trust.registry.issuer — Issuer Not Registered
    ├─ recognition   ✓
    └─ semantic      ⚠ (1 of 5 checks failed, 4 passed)
        └─ semantic.openbadges.schema.obv3.result-ref — Invalid Result Reference
```

The `└─` rows under each failing phase row come from `failureDetail()`.
Lazy-expand them — most users only want the verdict + per-phase status.

## Verbose mode

`verbose: true` restores the pre-v2.0.0 result shape on `results[]`
(every check that ran is included, with `id` populated). `summary[]`
is unchanged.

| Where | Wins |
|-------|------|
| `createVerifier({ verbose: true })` | Instance default |
| `verifier.verifyCredential({ credential, verbose: true })` | Per-call (overrides instance default) |
| `verifyCredential({ credential, verbose: true })` | Standalone wrapper |
| `verifier.verifyPresentation({ presentation, verbose: true })` | VP and every embedded VC inherit the flag |

When to use it:

- Triage of an unexpected `verified: false` outcome — see exactly
  which checks ran and what they returned.
- Persisted audit dumps where the full check sequence is part of the
  record.
- Debugger / browser dev-tools snapshots while wiring a new UI.

When _not_ to use it:

- Production happy-path responses. The folded shape is dramatically
  smaller and exactly what a UI needs.

## Backwards compatibility

- **Deprecated.** `CheckResult.check` and `CheckResult.suite` are
  marked `@deprecated`. Use `CheckResult.id` instead. Removal target:
  the major after v2.0.0.
- **`flattenPresentationResults`** is unchanged. In folded mode the
  array it returns is naturally smaller (failures + explicit skips
  only). Use it as the "give me one array of every relevant check"
  escape hatch when you don't want to walk
  `credentialResults[].results`.
- **Migration recipe for code that filtered/found by `check` or
  `suite`:**
  - Easiest: pass `verbose: true` and keep your existing assertions.
  - Cleanest: switch to `id` and prefix-matching against the summary
    rollup. See §6 step 3 for the canonical pattern.

## Prompt-ready appendix

Copy the fenced block below as the seed of an LLM prompt for the
dcc-transaction-service UI implementation.

> Given the JSON shape and `SuiteSummary` type below, produce a React
> component that renders a presentation verification result. Group
> per-credential summaries by phase
> (`cryptographic` → `trust` → `recognition` → `semantic` → `unknown`).
> Show failure detail rows (from `results[]` filtered by `id` prefix)
> under the failing phase row, lazy-expanded.
>
> The result is the return value of
> `verifier.verifyPresentation({ presentation })` from
> `@digitalcredentials/verifier-core` (v2.0.0+). The folded result
> shape is the default; `results[]` carries only failures and
> explicit `<suite>.applies` skips. Pass `verbose: true` to get
> every check.

---

**Folded JSON example.**

```jsonc
{
  "verified": false,
  "verifiablePresentation": { /* parsed VP */ },
  "presentationResults": [],
  "summary": [
    { "id": "cryptographic.proof", "phase": "cryptographic",
      "suite": "proof", "status": "success", "verified": true,
      "message": "1 of 1 check passed",
      "counts": { "passed": 1, "failed": 0, "skipped": 0 } }
  ],
  "credentialResults": [
    {
      "verified": true,
      "verifiableCredential": { /* good VC */ },
      "recognizedProfile": "obv3p0.openbadge",
      "results": [],
      "summary": [
        { "id": "cryptographic.core",  "phase": "cryptographic",
          "suite": "core",  "status": "success", "verified": true,
          "message": "4 of 4 checks passed",
          "counts": { "passed": 4, "failed": 0, "skipped": 0 } },
        { "id": "recognition", "phase": "recognition",
          "suite": "recognition", "status": "success", "verified": true,
          "message": "1 of 1 check passed",
          "counts": { "passed": 1, "failed": 0, "skipped": 0 } },
        { "id": "cryptographic.proof", "phase": "cryptographic",
          "suite": "proof", "status": "success", "verified": true,
          "message": "1 of 1 check passed",
          "counts": { "passed": 1, "failed": 0, "skipped": 0 } },
        { "id": "trust.registry", "phase": "trust",
          "suite": "registry", "status": "success", "verified": true,
          "message": "1 of 1 check passed",
          "counts": { "passed": 1, "failed": 0, "skipped": 0 } }
      ]
    },
    {
      "verified": false,
      "verifiableCredential": { /* bad VC */ },
      "recognizedProfile": "obv3p0.openbadge",
      "results": [
        { "id": "trust.registry.issuer",
          "suite": "registry", "check": "registry.issuer",
          "outcome": { "status": "failure", "problems": [
            { "type": "https://www.w3.org/TR/vc-data-model#ISSUER_NOT_REGISTERED",
              "title": "Issuer Not Registered",
              "detail": "Issuer DID not in any registry." }
          ]},
          "fatal": false }
      ],
      "summary": [
        { "id": "cryptographic.core",  "phase": "cryptographic",
          "suite": "core",  "status": "success", "verified": true,
          "message": "4 of 4 checks passed",
          "counts": { "passed": 4, "failed": 0, "skipped": 0 } },
        { "id": "recognition", "phase": "recognition",
          "suite": "recognition", "status": "success", "verified": true,
          "message": "1 of 1 check passed",
          "counts": { "passed": 1, "failed": 0, "skipped": 0 } },
        { "id": "cryptographic.proof", "phase": "cryptographic",
          "suite": "proof", "status": "success", "verified": true,
          "message": "1 of 1 check passed",
          "counts": { "passed": 1, "failed": 0, "skipped": 0 } },
        { "id": "trust.registry", "phase": "trust",
          "suite": "registry", "status": "failure", "verified": false,
          "message": "1 of 1 check failed",
          "counts": { "passed": 0, "failed": 1, "skipped": 0 } }
      ]
    }
  ]
}
```

**`SuiteSummary` type.**

```ts
type SuiteSummaryPhase =
  | 'cryptographic'
  | 'trust'
  | 'recognition'
  | 'semantic'
  | 'unknown';

interface SuiteSummary {
  id: string;
  phase: SuiteSummaryPhase;
  suite: string;
  status: 'success' | 'failure' | 'skipped' | 'mixed';
  verified: boolean;
  message: string;
  counts: { passed: number; failed: number; skipped: number };
  fatalFailureAt?: string;
}
```

**Grouping snippet.**

```ts
const PHASE_ORDER: SuiteSummary['phase'][] = [
  'cryptographic',
  'trust',
  'recognition',
  'semantic',
  'unknown',
];

function groupByPhase(cr: CredentialVerificationResult) {
  const groups = new Map<SuiteSummary['phase'], SuiteSummary[]>();
  for (const phase of PHASE_ORDER) groups.set(phase, []);
  for (const s of cr.summary) groups.get(s.phase)!.push(s);
  return groups;
}

function failureDetail(
  cr: CredentialVerificationResult,
  failing: SuiteSummary,
) {
  return cr.results.filter(r => r.id?.startsWith(failing.id + '.'));
}
```

**Layout reference.**

```
Presentation: ✗ (1 of 2 credentials verified)
├─ VP signature: ✓
├─ Credential 1 (obv3p0.openbadge): ✓
│   ├─ cryptographic ✓
│   ├─ trust         ✓
│   ├─ recognition   ✓
│   └─ semantic      ✓
└─ Credential 2 (obv3p0.openbadge): ✗
    ├─ cryptographic ✓
    ├─ trust         ✗ (1 of 1 check failed)
    │   └─ trust.registry.issuer — Issuer Not Registered
    ├─ recognition   ✓
    └─ semantic      ✓
```
