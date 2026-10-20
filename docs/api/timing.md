# Timing instrumentation

> Consumer reference for the optional `timing` flag and the
> `TaskTiming` data carried on every result when it is enabled.
>
> **Audience.** Performance and observability work in any client
> building on `verifier-core`.

## Table of Contents

1. [Overview](#overview)
2. [Enabling `timing`](#enabling-timing)
3. [The `TaskTiming` shape](#the-tasktiming-shape)
4. [Granularity](#granularity)
5. [Inclusive top-level convention](#inclusive-top-level-convention)
6. [Parse-failure behavior](#parse-failure-behavior)
7. [Recipes](#recipes)
8. [`TimeService` reference](#timeservice-reference)

## Overview

`verifier-core` can attach `TaskTiming` data to every
`CheckResult`, every `SuiteSummary`, and every top-level
`Credential|PresentationVerificationResult`. The feature is
opt-in via a `timing: boolean` flag: settable on
`VerifierConfig`, overridable per call, and automatically
propagated from `verifyPresentation` into embedded
`verifyCredential` calls.

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
per-check timings carried on `results[]`.

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
`cryptographic.parsing.envelope` `CheckResult`. With `timing: true`, this
synthetic check, its synthetic suite summary, and the top-level
result all carry `timing` — same as a normal run:

```jsonc
{
  "verified": false,
  "results": [
    { "id": "cryptographic.parsing.envelope",
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

## Recipes

### Slowest check

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

The `TimeService` is the source of truth for any check that
needs to ask "what time is it?". `cryptographic.proof.signature`
already reads it to judge credential expiry (`validUntil` /
`expirationDate`) and `cryptographic.status.bitstring` to judge
status-list freshness, so a
verifier built on a `FakeTimeService` decides both at the pinned
moment. Signature clock-skew windows and key rotation belong
there too. Read it from `VerificationContext.timeService` inside
`execute()`.
