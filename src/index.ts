/*!
 * Copyright (c) 2022 Digital Credentials Consortium. All rights reserved.
 */

// ==================== Main Public API ====================

export { verifyCredential, verifyPresentation } from './verify-suite.js';
export { createVerifier } from './verifier.js';
export type {
  Verifier,
  VerifierConfig,
  VerifyCredentialCall,
  VerifyPresentationCall
} from './types/verifier.js';
export type {
  CredentialVerificationResult,
  PresentationVerificationResult
} from './types/result.js';
export type {
  VerifyCredentialOptions,
  VerifyPresentationOptions
} from './types/options.js';
export type {
  EntityIdentityRegistry,
  OidfEntityIdentityRegistry,
  DccLegacyEntityIdentityRegistry,
  VcRecognitionEntityIdentityRegistry,
  RegistryLookupResult,
  LookupIssuers,
  LookupIssuersOptions
} from './types/registry.js';

// ==================== Core Types ====================

export type {
  CheckResult,
  CheckOutcome,
  VerificationCheck,
  VerificationSuite,
  VerificationSubjectType,
  SuitePhase
} from './types/check.js';
export type { SuiteSummary, SuiteSummaryPhase } from './types/suite-summary.js';
export type { TaskTiming } from './types/timing.js';
export type { ProblemDetail } from './types/problem-detail.js';
export type {
  VerificationContext,
  DocumentLoader,
  FetchJson
} from './types/context.js';
export type { HttpGetResult } from './types/http.js';
export type {
  CryptoService,
  CryptoResult,
  CryptoVerifyOptions
} from './types/crypto-service.js';
export type {
  CryptoSuite,
  LinkedDataSuite,
  DataIntegritySuite,
  ProofPurpose
} from './types/crypto-suite.js';
export type { VerificationSubject } from './types/subject.js';
export type { RecognizerSpec, RecognitionResult } from './types/recognition.js';

// ==================== Service Interfaces ====================

export type { CacheService } from './services/cache-service/cache-service.js';
export { InMemoryCacheService } from './services/cache-service/in-memory-cache-service.js';
export type { HttpGetService } from './services/http-get-service/http-get-service.js';
export { BuiltinHttpGetService } from './services/http-get-service/builtin-http-get-service.js';
export type { TimeService } from './services/time-service/time-service.js';
export { RealTimeService } from './services/time-service/real-time-service.js';
export { FakeTimeService } from './services/time-service/fake-time-service.js';

// ==================== Schema Types and Parsing ====================

export type { VerifiableCredential } from './schemas/credential.js';
export type { VerifiablePresentation } from './schemas/presentation.js';
export { parseCredential, parsePresentation } from './schemas/index.js';

// ==================== Verification Suites ====================

export { coreSuite } from './suites/core/index.js';
export { proofSuite } from './suites/proof/index.js';
export { statusSuite } from './suites/status/index.js';
export { registrySuite } from './suites/registry/index.js';
export { recognitionSuite } from './suites/recognition/index.js';

// ==================== Utilities ====================

export { formatJsonPointer } from './util/json-pointer.js';

// ==================== Extension points ====================

export { ProblemTypes } from './problem-types.js';
export type { ProblemType } from './problem-types.js';
export type {
  RegistryHandlerContext,
  RegistryHandlerMap,
  RegistryHandler
} from './services/registry-handlers/types.js';
export { DataIntegrityCryptoService } from './services/data-integrity-crypto.js';
export type { DataIntegrityCryptoConfig } from './services/data-integrity-crypto.js';
export { flattenPresentationResults } from './flatten-presentation-results.js';
export type { FlattenedCheckResult } from './flatten-presentation-results.js';
export { foldCheckResults, computeId } from './fold-results.js';
export type { FoldOptions } from './fold-results.js';
