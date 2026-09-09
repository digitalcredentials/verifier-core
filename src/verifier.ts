/**
 * `createVerifier(...)` — factory for a configured {@link Verifier}.
 *
 * A `Verifier` owns long-lived dependencies (HTTP, cache, crypto
 * services, registries, registry handlers, document loader) and
 * exposes per-call `verifyCredential` / `verifyPresentation` methods
 * that share those dependencies — most importantly the cache.
 *
 * Each verifier without an explicit `cacheService` gets its own fresh
 * `InMemoryCacheService`; cache contents are isolated from other
 * verifiers in the same process. To share cache state across verifiers
 * (e.g. a long-running service holding several pre-built verifiers),
 * construct one `InMemoryCacheService` (or any `CacheService` adapter)
 * and pass it via `createVerifier({ cacheService })`.
 *
 * Construct a single `Verifier` for any batch or repeated verification
 * work; reusing the instance lets issuer DID documents, status list
 * credentials, and JSON-LD contexts be fetched once and reused. The
 * standalone wrappers in `verify-suite.ts` create a fresh verifier per
 * call and are intended only for one-shot use.
 *
 * ## INVARIANT: suites see the bytes the issuer signed
 *
 * `parseCredential` / `parsePresentation` are validation gates only. Their
 * output is discarded and the caller's original object is what flows into
 * `runSuites` and back out as `result.verifiableCredential`.
 *
 * Zod rewrites what it parses. `.passthrough()` does not extend into nested
 * object schemas, so any nested `z.object({...})` deletes the keys it does
 * not name, and `JsonLdField` rewrites scalars into arrays. Either change
 * alters the canonicalized N-Quads, which makes a valid proof fail as
 * `INVALID_SIGNATURE` — a failure that looks like a bad credential and is
 * actually a bug here. That is not hypothetical: a spec-legal
 * `issuer.image.caption` was dropped by `IssuerObjectSchema` and rejected
 * production Open Badges credentials.
 *
 * Returning the original object also matters downstream, because consumers
 * re-verify `result.verifiableCredential` (the async Open Badges pass in
 * dcc-transaction-service does exactly this). Handing them a rewritten copy
 * makes the second pass fail where the first passed.
 *
 * Suites must therefore tolerate raw JSON-LD shapes rather than assume
 * normalization: `@context` and `type` may each be a string or an array.
 *
 * @example
 * ```ts
 * const verifier = createVerifier({ registries: myRegistries });
 * for (const credential of credentials) {
 *   const result = await verifier.verifyCredential({ credential });
 * }
 * ```
 */

import type {
  Verifier,
  VerifierConfig,
  VerifyCredentialCall,
  VerifyPresentationCall
} from './types/verifier.js';
import type { VerificationContext } from './types/context.js';
import type {
  VerificationSuite,
  CheckResult,
  SuitePhase
} from './types/check.js';
import type { RecognitionResult, RecognizerSpec } from './types/recognition.js';
import type {
  CredentialVerificationResult,
  PresentationVerificationResult
} from './types/result.js';
import type { SuiteSummary } from './types/suite-summary.js';
import { parseCredential, VerifiableCredential } from './schemas/credential.js';
import {
  parsePresentation,
  type VerifiablePresentation
} from './schemas/presentation.js';
import { runSuites } from './run-suites.js';
import { extractCredentialsFrom } from './extract-credentials-from.js';
import { defaultSuites } from './default-suites.js';
import { proofSuite } from './suites/proof/index.js';
import { computeId, foldCheckResults } from './fold-results.js';
import {
  defaultHttpGetService,
  createDefaultCacheService,
  defaultCryptoServices,
  defaultDocumentLoaderFor
} from './default-services.js';
import { createRegistryLookup } from './services/registry-lookup.js';
import { RealTimeService } from './services/time-service/real-time-service.js';
import type { TimeService } from './services/time-service/time-service.js';
import { fetchJsonFromHttpGet } from './util/fetch-json-from-http-get.js';
import type { ProblemDetail } from './types/problem-detail.js';
import type { EntityIdentityRegistry } from './types/registry.js';
import type { TaskTiming } from './types/timing.js';
import { ProblemTypes } from './problem-types.js';

export function createVerifier(config: VerifierConfig = {}): Verifier {
  const httpGetService = config.httpGetService ?? defaultHttpGetService();
  const cacheService = config.cacheService ?? createDefaultCacheService();
  const cryptoServices = config.cryptoServices ?? defaultCryptoServices();
  const documentLoader =
    config.documentLoader ?? defaultDocumentLoaderFor(httpGetService);
  const fetchJson = fetchJsonFromHttpGet(httpGetService);
  const constructorRegistries = config.registries;
  const recognizers = config.recognizers ?? [];
  const constructorPhases = config.phases;
  const constructorVerbose = config.verbose;
  const constructorTiming = config.timing;
  const timeService: TimeService = config.timeService ?? RealTimeService();

  // Forward-declared verifier reference. The lookupIssuers thunk closes
  // over this slot so handlers can recursively call back into the
  // parent verifier (used by vc-recognition to verify the recognition
  // VC). The slot is filled below, after the verifier object is built.
  const verifierRef: { current: Verifier | undefined } = { current: undefined };
  const lookupIssuers = createRegistryLookup(
    httpGetService,
    cacheService,
    config.registryHandlers,
    () => {
      if (verifierRef.current === undefined) {
        throw new Error('verifierRef accessed before createVerifier returned');
      }
      return verifierRef.current;
    }
  );

  const verifier: Verifier = {
    verifyCredential: async (call: VerifyCredentialCall) => {
      const timing = call.timing ?? constructorTiming ?? false;
      const topLevel = timing ? startTopLevelTiming(timeService) : undefined;

      const parseResult = parseCredential(call.credential);
      if (!parseResult.success) {
        const result = parseFailureCredentialResult(
          call.credential,
          parseResult.error,
          timing ? timeService : undefined
        );
        return finalizeCredentialResult(result, topLevel, timeService);
      }
      // Zod is a validation gate here, NOT a normalizer: `parseResult.data` is
      // deliberately discarded. See the invariant in this module's header.
      const credential = call.credential as VerifiableCredential;

      const ctx = buildContext({
        httpGetService,
        cacheService,
        cryptoServices,
        documentLoader,
        fetchJson,
        lookupIssuers,
        registries: call.registries ?? constructorRegistries,
        recognizers,
        timeService,
        timing
      });

      const additionalSuites = call.additionalSuites ?? [];
      const suites: VerificationSuite[] = [
        ...defaultSuites,
        ...additionalSuites
      ];
      const explicitSuiteIds = new Set(additionalSuites.map(s => s.id));
      const requestedPhases = call.phases ?? constructorPhases;
      const effectivePhases = expandPhases(requestedPhases);
      const rawChecks = await runSuites(
        suites,
        { verifiableCredential: credential },
        ctx,
        { explicitSuiteIds, phases: effectivePhases }
      );

      const recognized = extractRecognition(rawChecks);

      populateCheckIds(rawChecks, suites);

      const verbose = call.verbose ?? constructorVerbose ?? false;
      const folded = foldCheckResults(rawChecks, suites, { verbose });

      const result: CredentialVerificationResult = {
        verified: !hasFatalFailures(rawChecks),
        verifiableCredential: credential,
        normalizedVerifiableCredential: recognized?.normalized,
        recognizedProfile: recognized?.profile,
        results: folded.results,
        summary: folded.summaries
      };
      if (requestedPhases !== undefined) {
        result.partial = true;
      }
      return finalizeCredentialResult(result, topLevel, timeService);
    },

    verifyPresentation: async (call: VerifyPresentationCall) => {
      const timing = call.timing ?? constructorTiming ?? false;
      const topLevel = timing ? startTopLevelTiming(timeService) : undefined;

      const parseResult = parsePresentation(call.presentation);
      if (!parseResult.success) {
        const result = parseFailurePresentationResult(
          call.presentation,
          parseResult.error,
          timing ? timeService : undefined
        );
        return finalizePresentationResult(result, topLevel, timeService);
      }
      // Same discipline as `verifyCredential`: validate with Zod, then verify
      // the object the holder actually signed. Using `parseResult.data` here
      // also handed the recursive `verifyCredential` calls below a rewritten
      // copy of each embedded credential.
      const presentation = call.presentation as VerifiablePresentation;

      const ctx = buildContext({
        httpGetService,
        cacheService,
        cryptoServices,
        documentLoader,
        fetchJson,
        lookupIssuers,
        registries: call.registries ?? constructorRegistries,
        recognizers,
        challenge: call.challenge ?? null,
        unsignedPresentation: call.unsignedPresentation ?? false,
        timeService,
        timing
      });

      const additionalSuites = call.additionalSuites ?? [];
      const presentationSuites: VerificationSuite[] = [
        proofSuite,
        ...additionalSuites
      ];
      const explicitSuiteIds = new Set(additionalSuites.map(s => s.id));
      const requestedPhases = call.phases ?? constructorPhases;
      const effectivePhases = expandPhases(requestedPhases);
      const rawPresentationChecks = await runSuites(
        presentationSuites,
        { verifiablePresentation: presentation },
        ctx,
        { explicitSuiteIds, phases: effectivePhases }
      );

      populateCheckIds(rawPresentationChecks, presentationSuites);

      const verbose = call.verbose ?? constructorVerbose ?? false;
      const foldedPresentation = foldCheckResults(
        rawPresentationChecks,
        presentationSuites,
        { verbose }
      );

      const credentials = extractCredentialsFrom(presentation);
      const credentialResults: CredentialVerificationResult[] = [];
      if (credentials && credentials.length > 0) {
        for (const credential of credentials) {
          credentialResults.push(
            await verifier.verifyCredential({
              credential,
              additionalSuites: call.additionalSuites,
              registries: call.registries,
              phases: call.phases,
              verbose,
              // Propagate explicitly so embedded credentials inherit
              // the presentation-level decision; otherwise the
              // recursive call would re-evaluate from
              // `constructorTiming` (usually matches, but diverges
              // when the per-call `timing` overrode it here).
              timing
            })
          );
        }
      }

      const presentationVerified = !hasFatalFailures(rawPresentationChecks);
      const allCredentialsVerified = credentialResults.every(cr => cr.verified);

      const result: PresentationVerificationResult = {
        verified: presentationVerified && allCredentialsVerified,
        verifiablePresentation: presentation,
        presentationResults: foldedPresentation.results,
        credentialResults,
        summary: foldedPresentation.summaries
      };
      if (requestedPhases !== undefined) {
        result.partial = true;
      }
      return finalizePresentationResult(result, topLevel, timeService);
    }
  };

  verifierRef.current = verifier;
  return verifier;
}

interface BuildContextInput {
  httpGetService: VerificationContext['httpGetService'];
  cacheService: VerificationContext['cacheService'];
  cryptoServices: VerificationContext['cryptoServices'];
  documentLoader: VerificationContext['documentLoader'];
  fetchJson: VerificationContext['fetchJson'];
  lookupIssuers: VerificationContext['lookupIssuers'];
  registries?: EntityIdentityRegistry[];
  recognizers?: RecognizerSpec[];
  challenge?: string | null;
  unsignedPresentation?: boolean;
  timeService: TimeService;
  timing: boolean;
}

/**
 * Internal context builder for `createVerifier`. Assembles the injected
 * adapters (HTTP, cache, crypto services, document loader) into the
 * {@link VerificationContext} every check receives.
 */
function buildContext(input: BuildContextInput): VerificationContext {
  return {
    documentLoader: input.documentLoader,
    fetchJson: input.fetchJson,
    httpGetService: input.httpGetService,
    cacheService: input.cacheService,
    cryptoServices: input.cryptoServices,
    registries: input.registries,
    recognizers: input.recognizers,
    lookupIssuers: input.lookupIssuers,
    challenge: input.challenge ?? null,
    unsignedPresentation: input.unsignedPresentation ?? false,
    timeService: input.timeService,
    timing: input.timing
  };
}

function hasFatalFailures(results: CheckResult[]): boolean {
  return results.some(r => r.fatal && r.outcome.status === 'failure');
}

/**
 * Populate `id` on every `CheckResult` using {@link computeId} so
 * folded summaries and verbose-mode consumers both see the
 * dot-separated namespace. Mutates each result in place; called
 * after `runSuites` returns and before {@link foldCheckResults}.
 */
function populateCheckIds(
  checks: CheckResult[],
  suites: VerificationSuite[]
): void {
  const phaseBySuiteId = new Map<string, SuitePhase | undefined>();
  for (const s of suites) {
    phaseBySuiteId.set(s.id, s.phase);
  }
  for (const c of checks) {
    c.id = computeId(phaseBySuiteId.get(c.suite), c.suite, c.check);
  }
}

/**
 * Apply the auto-include rule for phase requests: if `'semantic'`
 * is requested without `'recognition'`, add `'recognition'` so
 * semantic checks have access to the normalized credential form
 * the recognizer produces.
 *
 * `undefined` (the default — all phases) is passed through
 * unchanged. No deduplication is performed beyond the auto-include
 * itself; consumers that pass duplicates get duplicates.
 */
function expandPhases(
  requested: SuitePhase[] | undefined
): SuitePhase[] | undefined {
  if (requested === undefined) {
    return undefined;
  }
  if (requested.includes('semantic') && !requested.includes('recognition')) {
    return [...requested, 'recognition'];
  }
  return requested;
}

/**
 * Locate the `recognition.profile` success outcome in the result
 * stream and lift its `payload` into the typed `RecognitionResult`
 * the verifier surfaces as
 * {@link CredentialVerificationResult.normalizedVerifiableCredential}.
 *
 * Returns `undefined` if recognition was skipped, failed, or the
 * payload didn't materialize as expected (defensive against
 * downstream check shape drift).
 */
function extractRecognition(
  results: CheckResult[]
): { profile: string; normalized: unknown } | undefined {
  const result = results.find(r => r.check === 'recognition.profile');
  if (!result || result.outcome.status !== 'success') {
    return undefined;
  }
  const payload = result.outcome.payload as RecognitionResult | undefined;
  if (!payload || payload.status !== 'recognized') {
    return undefined;
  }
  return { profile: payload.profile, normalized: payload.normalized };
}

/**
 * Synthetic suite definition used solely so the parse-error
 * `CheckResult` folds into a meaningful `SuiteSummary`. Tagged
 * `'cryptographic'` so UI sections that group by phase show
 * structural failures alongside other foundational checks.
 */
const PARSING_SUITE: VerificationSuite = {
  id: 'parsing',
  name: 'Envelope parsing',
  phase: 'cryptographic',
  checks: [
    {
      id: 'parsing.envelope',
      name: 'Parse credential / presentation envelope',
      fatal: true,
      execute: async () => ({ status: 'failure', problems: [] })
    }
  ]
};

function parseErrorResult(
  problem: ProblemDetail,
  timeService: TimeService | undefined
): CheckResult {
  const result: CheckResult = {
    suite: 'parsing',
    check: 'parsing.envelope',
    outcome: { status: 'failure', problems: [problem] },
    fatal: true
  };
  result.id = computeId(PARSING_SUITE.phase, 'parsing', 'parsing.envelope');
  if (timeService !== undefined) {
    // Parse failures short-circuit before any check runs, so the
    // synthetic `parsing.envelope` check is the only thing the
    // result carries. Sample both clocks twice so the produced
    // `TaskTiming` reflects the cost of recording the failure
    // and so suite-level rollup math (sum of child durations)
    // works the same way it does for normal runs.
    const startedDateMs = timeService.dateNowMs();
    const startedMonoMs = timeService.performanceNowMs();
    const endedDateMs = timeService.dateNowMs();
    const endedMonoMs = timeService.performanceNowMs();
    result.timing = {
      startedAt: new Date(startedDateMs).toISOString(),
      endedAt: new Date(endedDateMs).toISOString(),
      durationMs: endedMonoMs - startedMonoMs
    };
  }
  return result;
}

/**
 * Build the one-entry `summary[]` that accompanies every
 * parse-error result. The single check is always a fatal failure,
 * so the summary always has `status: 'failure'`,
 * `verified: false`. We surface the parse error in `results[]`
 * regardless of `verbose` (a parse error is unusable without it).
 *
 * Folds in `verbose: true` so the parse-error check survives;
 * `foldCheckResults` rolls per-check timing into the summary, so
 * the suite-level `timing` propagates here too when the call ran
 * with `timing: true`.
 */
function parseErrorSummary(check: CheckResult): SuiteSummary[] {
  const folded = foldCheckResults([check], [PARSING_SUITE], { verbose: true });
  return folded.summaries;
}

function parseFailureCredentialResult(
  credential: unknown,
  error: { errors: Array<{ path: Array<string | number>; message: string }> },
  timeService: TimeService | undefined
): CredentialVerificationResult {
  const problem: ProblemDetail = {
    type: ProblemTypes.PARSING_ERROR,
    title: 'Credential Parsing Failed',
    detail: error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ')
  };
  const check = parseErrorResult(problem, timeService);
  return {
    verified: false,
    verifiableCredential: credential as VerifiableCredential,
    results: [check],
    summary: parseErrorSummary(check)
  };
}

function parseFailurePresentationResult(
  presentation: unknown,
  error: { errors: Array<{ path: Array<string | number>; message: string }> },
  timeService: TimeService | undefined
): PresentationVerificationResult {
  const problem: ProblemDetail = {
    type: ProblemTypes.PARSING_ERROR,
    title: 'Presentation Parsing Failed',
    detail: error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ')
  };
  const check = parseErrorResult(problem, timeService);
  return {
    verified: false,
    verifiablePresentation: presentation as VerifiablePresentation,
    presentationResults: [check],
    credentialResults: [],
    summary: parseErrorSummary(check)
  };
}

interface InProgressTopLevelTiming {
  startedAt: string;
  startedMonoMs: number;
}

/**
 * Sample both clocks at the very top of a `verifyCredential` /
 * `verifyPresentation` call so {@link finalizeCredentialResult}
 * and {@link finalizePresentationResult} can produce an
 * inclusive `TaskTiming` that wraps every check (including
 * recursive `verifyCredential` invocations on embedded VCs in
 * the presentation case).
 */
function startTopLevelTiming(
  timeService: TimeService
): InProgressTopLevelTiming {
  return {
    startedAt: new Date(timeService.dateNowMs()).toISOString(),
    startedMonoMs: timeService.performanceNowMs()
  };
}

/**
 * Close out a top-level timing started with
 * {@link startTopLevelTiming}, sampling both clocks at the
 * moment the result is about to be returned. `endedAt` /
 * `durationMs` therefore reflect the entire body of the call.
 */
function finishTopLevelTiming(
  started: InProgressTopLevelTiming,
  timeService: TimeService
): TaskTiming {
  return {
    startedAt: started.startedAt,
    endedAt: new Date(timeService.dateNowMs()).toISOString(),
    durationMs: timeService.performanceNowMs() - started.startedMonoMs
  };
}

function finalizeCredentialResult(
  result: CredentialVerificationResult,
  topLevel: InProgressTopLevelTiming | undefined,
  timeService: TimeService
): CredentialVerificationResult {
  if (topLevel !== undefined) {
    result.timing = finishTopLevelTiming(topLevel, timeService);
  }
  return result;
}

function finalizePresentationResult(
  result: PresentationVerificationResult,
  topLevel: InProgressTopLevelTiming | undefined,
  timeService: TimeService
): PresentationVerificationResult {
  if (topLevel !== undefined) {
    result.timing = finishTopLevelTiming(topLevel, timeService);
  }
  return result;
}
