# Timing instrumentation

> Consumer reference for the optional `timing` flag and the
> `TaskTiming` data carried on every result when it is enabled.
>
> **Audience.** Performance / observability work in
> `dcc-transaction-service`, `skills-verifier`, and any future
> client building on `verifier-core`. The §10 LLM-prompt
> appendix is written to be copy-pasted as the seed of an LLM
> prompt for client-side instrumentation code-gen.

## Table of Contents

1. [Overview](#overview)
2. [Enabling `timing`](#enabling-timing)
3. [The `TaskTiming` shape](#the-tasktiming-shape)
4. [Granularity](#granularity)
5. [Inclusive top-level convention](#inclusive-top-level-convention)
6. [Parse-failure behavior](#parse-failure-behavior)
7. [Folding caveat](#folding-caveat)
8. [Recipes](#recipes)
9. [`TimeService` reference](#timeservice-reference)
10. [Prompt-ready appendix](#prompt-ready-appendix)

## Overview

`verifier-core` can attach `TaskTiming` data to every
`CheckResult`, every `SuiteSummary`, and every top-level
`Credential|PresentationVerificationResult`. The feature is
opt-in via a `timing: boolean` flag that mirrors the existing
`verbose` flag's plumbing: settable on `VerifierConfig`,
overridable per call, and automatically propagated from
`verifyPresentation` into embedded `verifyCredential` calls.

Cost when enabled: two `Date.now()`-equivalent reads and two
`performance.now()`-equivalent reads per check, plus one of
each for the top-level wrapper. Negligible at verification
scales (the cryptographic and JSON-LD work dwarfs it). When
the flag is off (the default), no timing fields appear
anywhere and instrumentation has zero overhead.

## Enabling `timing`

**Constructor flag.** Apply to every call on the verifier:

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';

const verifier = createVerifier({ timing: true });
const result = await verifier.verifyCredential({ credential });
console.log(result.timing); // { startedAt, endedAt, durationMs }
```

**Per-call override.** Wins over the constructor default:

```ts
const verifier = createVerifier({}); // timing defaults to false
const result = await verifier.verifyCredential({
  credential,
  timing: true,
});
```

`verifyPresentation` propagates the resolved `timing` value
into embedded `verifyCredential` calls automatically — every
credential in `result.credentialResults[i]` shares the same
`timing` decision, so the top-level call's `timing` is a true
inclusive wrapper (see §5).

Pairs naturally with `verbose: true` so per-check timings
survive in `results[]`. Without verbose, individual
`CheckResult.timing` entries fold away — but per-suite timing
on `summary[]` still survives (see §7).

## The `TaskTiming` shape

```ts
export interface TaskTiming {
  /** ISO 8601 wall-clock at task start. */
  startedAt: string;
  /** ISO 8601 wall-clock at task end (>= `startedAt`). */
  endedAt: string;
  /** Monotonic duration in fractional ms (>= 0). */
  durationMs: number;
  /**
   * Reserved for future sub-event capture from inside one
   * task. Recursive so a sub-event can have its own
   * sub-events. Empty / omitted in the current release.
   */
  events?: ReadonlyArray<TaskTiming & { name: string }>;
}
```

| Field        | Source                              | Use it for                                 |
| ------------ | ----------------------------------- | ------------------------------------------ |
| `startedAt`  | `TimeService.dateNowMs()` → ISO     | Log correlation, human-readable timelines  |
| `endedAt`    | `TimeService.dateNowMs()` → ISO     | Log correlation                            |
| `durationMs` | `TimeService.performanceNowMs()` Δ | The only correct field to sort / sum       |
| `events`     | (reserved; not populated today)     | Future fine-grained sub-event capture      |

**Why two clocks?** `startedAt` / `endedAt` are wall-clock and
useful for log correlation. `durationMs` comes from the
monotonic clock — immune to wall-clock jumps (NTP, DST). Use
`durationMs` for any sort / sum / comparison; never compute
`endedAt - startedAt` for performance work.

## Granularity

| Level     | Where it lives                                              | Captures                                                                                       |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Per-check | `result.results[i].timing`                                  | Wall-clock window + monotonic duration of one check's `execute()`                              |
| Per-suite | `result.summary[i].timing`                                  | `min(child startedAt) → max(child endedAt)`; `durationMs = sum of child durationMs` (see §5)  |
| Per-call  | `result.timing` (and `presentationResult.timing`)           | Inclusive wrapper around the entire `verifyCredential` / `verifyPresentation` body             |

Per-suite timing is computed by `foldCheckResults` from the
per-check timings before checks are folded out of `results[]`,
so it survives `verbose: false` consumption (see §7).

## Inclusive top-level convention

Top-level `result.timing` always wraps the **entire** method
body — including any recursive `verifyCredential` calls
`verifyPresentation` makes for embedded VCs. So:

```
result.timing.durationMs >= max(s.timing.durationMs for s in result.summary)
result.timing.durationMs >= max(cr.timing.durationMs for cr in result.credentialResults)
```

In a presentation result, "presentation-only time" is the sum
of `presentationResults`-side suite timings:

```ts
const presentationOnlyMs = result.summary
  .map(s => s.timing?.durationMs ?? 0)
  .reduce((a, b) => a + b, 0);

const credentialsOnlyMs = result.credentialResults
  .map(cr => cr.timing?.durationMs ?? 0)
  .reduce((a, b) => a + b, 0);

// result.timing.durationMs ≈ presentationOnlyMs + credentialsOnlyMs + overhead
```

Suite-level `durationMs` is intentionally the **sum** of child
check durations, not `endedAt - startedAt`. The summed-CPU
semantic is what consumers actually want when comparing suite
cost — `endedAt - startedAt` would also include any inter-check
gap (event-loop yields in the orchestrator), which is not part
of the suite's own work.

## Parse-failure behavior

When a credential or presentation envelope fails to parse, the
verifier short-circuits with a single synthetic
`parsing.envelope` `CheckResult`. With `timing: true`, this
synthetic check, its synthetic suite summary, and the top-level
result all carry `timing` — same as a normal run:

```jsonc
{
  "verified": false,
  "results": [
    { "id": "cryptographic.parsing.parsing.envelope",
      "outcome": { "status": "failure", "problems": [/* ... */] },
      "fatal": true,
      "timing": { "startedAt": "...", "endedAt": "...", "durationMs": 0.001 } }
  ],
  "summary": [
    { "id": "cryptographic.parsing", /* ... */
      "timing": { "startedAt": "...", "endedAt": "...", "durationMs": 0.001 } }
  ],
  "timing": { "startedAt": "...", "endedAt": "...", "durationMs": 0.4 }
}
```

This keeps the consumer's "extract timing from result" code
path uniform across success and parse-failure outcomes.

## Folding caveat

`verbose: false` (the default) hides individual
`CheckResult.timing` entries — they fold away into the
per-suite rollup just like the checks themselves. Per-suite
`SuiteSummary.timing` survives in `summary[]` and remains the
canonical surface for non-verbose consumers.

If you need per-check timing detail, opt into both:

```ts
const verifier = createVerifier({ timing: true, verbose: true });
```

## Recipes

### Slowest check (verbose mode)

```ts
const slowestChecks = result.results
  .filter(c => c.timing !== undefined)
  .sort((a, b) => b.timing!.durationMs - a.timing!.durationMs)
  .slice(0, 5);
```

### Slowest suite

```ts
const slowestSuites = result.summary
  .filter(s => s.timing !== undefined)
  .sort((a, b) => b.timing!.durationMs - a.timing!.durationMs);
```

### Slowest credential in a presentation

```ts
const slowestCredentials = presentationResult.credentialResults
  .filter(cr => cr.timing !== undefined)
  .sort((a, b) => b.timing!.durationMs - a.timing!.durationMs);
```

## `TimeService` reference

```ts
export interface TimeService {
  dateNowMs(): number;
  performanceNowMs(): number;
}
```

Two factories ship with the package:

| Factory             | Use it for                                              |
| ------------------- | ------------------------------------------------------- |
| `RealTimeService()` | Production. The default when no override is passed.    |
| `FakeTimeService()` | Tests. Both clocks are deterministic counter-driven.   |

Override via `VerifierConfig.timeService`:

```ts
import {
  createVerifier,
  FakeTimeService,
} from '@digitalcredentials/verifier-core';

const verifier = createVerifier({
  timing: true,
  timeService: FakeTimeService(),
});
const result = await verifier.verifyCredential({ credential });
expect(result.results[0].timing!.durationMs).to.equal(1); // exact!
```

`FakeTimeService` returns deterministic monotonic values from
both clocks, so every `TaskTiming` field — including
`durationMs` — is exact-value-assertable. See
`src/services/time-service/fake-time-service.ts` for the
counter semantics and `seed` options (`baseDateMs`,
`performanceTickMs`).

The `TimeService` is the recommended source of truth for any
future check that needs to ask "what time is it?" — credential
expiration, signature clock-skew windows, key rotation,
status-list freshness, etc. Read it from
`VerificationContext.timeService` inside `execute()`.

## Prompt-ready appendix

> Drop this section verbatim into an LLM prompt for client-side
> instrumentation code-gen.

`@digitalcredentials/verifier-core` v2 emits optional
`TaskTiming` data on every result when constructed with
`timing: true`:

```ts
import { createVerifier } from '@digitalcredentials/verifier-core';
const verifier = createVerifier({ timing: true });
const result = await verifier.verifyPresentation({ presentation });
```

Every result then carries a `timing: TaskTiming` field at three
levels:

```ts
interface TaskTiming {
  startedAt: string;            // ISO 8601 wall-clock
  endedAt: string;              // ISO 8601 wall-clock
  durationMs: number;           // monotonic, fractional ms
  events?: ReadonlyArray<TaskTiming & { name: string }>; // reserved
}

// Per-check (only in verbose: true mode):
result.results[i].timing
// Per-suite (always present in summary[] when timing: true):
result.summary[i].timing
// Top-level inclusive wrapper:
result.timing
// In verifyPresentation results, each embedded VC also has:
result.credentialResults[i].timing
```

Invariants (always hold when `timing: true`):

1. `endedAt >= startedAt` for every `TaskTiming`.
2. `durationMs >= 0` for every `TaskTiming`.
3. Top-level `result.timing.durationMs >= max(s.timing.durationMs for s in result.summary)`.
4. `verifyPresentation` top-level `result.timing.durationMs >= cr.timing.durationMs` for every `cr in result.credentialResults`.
5. Per-suite `timing.durationMs == sum(child timing.durationMs)`.
6. Per-suite `timing.startedAt == min(child startedAt)`,
   per-suite `timing.endedAt == max(child endedAt)`.

Use `durationMs` for any sort / sum / comparison (it comes
from a monotonic clock); use `startedAt` / `endedAt` only for
log correlation and human-readable timelines.

A "verification time breakdown" UI from a presentation result:

```ts
function buildBreakdown(result: PresentationVerificationResult) {
  const totalMs = result.timing!.durationMs;
  return {
    totalMs,
    presentationOnlyMs: result.summary
      .reduce((a, s) => a + (s.timing?.durationMs ?? 0), 0),
    credentials: result.credentialResults.map(cr => ({
      id: cr.verifiableCredential.id,
      totalMs: cr.timing!.durationMs,
      bySuite: cr.summary.map(s => ({
        suite: s.id,
        durationMs: s.timing!.durationMs,
        verified: s.verified,
      })),
    })),
  };
}
```
