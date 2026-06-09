/**
 * Type definitions for @digitalcredentials/vc
 *
 * These declarations override the JSDoc-inferred types from the JavaScript source.
 * NOTE: The project has its own types in src/types/*.ts, so we keep these minimal
 * to avoid conflicts while still providing proper function signatures.
 */

// Use the project's own types or 'any' to avoid conflicts
type AnyCredential = any;
type AnyPresentation = any;
type AnyProof = any;
type AnySuite = any;
type AnyPurpose = any;
type AnyDocumentLoader = any;
type AnyStatusResult = any;

// Status check function - permissive to accept () => boolean
export type CheckStatusFunction = (...args: any[]) => any;

// Document loader
export type DocumentLoader = (url: string) => Promise<any>;

// Verification result types - permissive
export interface VerifyCredentialResult {
  verified: boolean;
  statusResult?: any;
  results?: any[];
  error?: any;
  log?: any[];
}

export interface VerifyPresentationResult {
  verified: boolean;
  presentationResult?: any;
  credentialResults?: any[];
  error?: any;
}

// Options interfaces with permissive types
export interface IssueOptions {
  credential: AnyCredential;
  suite: AnySuite | AnySuite[];
  purpose?: AnyPurpose;
  documentLoader?: AnyDocumentLoader;
  now?: string | Date;
}

export interface DeriveOptions {
  verifiableCredential: AnyCredential;
  suite: AnySuite | AnySuite[];
  documentLoader?: AnyDocumentLoader;
}

export interface VerifyOptions {
  presentation?: AnyPresentation;
  suite: AnySuite | AnySuite[];
  unsignedPresentation?: boolean;
  presentationPurpose?: AnyPurpose;
  challenge?: string | null;
  controller?: string | object;
  domain?: string;
  documentLoader?: AnyDocumentLoader;
  checkStatus?: CheckStatusFunction | null | undefined;
  now?: string | Date;
  verifyMatchingIssuers?: boolean;
}

export interface VerifyCredentialOptions {
  credential: AnyCredential;
  suite: AnySuite | AnySuite[];
  purpose?: AnyPurpose;
  documentLoader?: AnyDocumentLoader;
  // TODO: undefined is preferred over null as it matches the JSDoc types
  checkStatus?: CheckStatusFunction | null | undefined; 
  now?: string | Date;
  verifyMatchingIssuers?: boolean;
}

export interface CreatePresentationOptions {
  verifiableCredential?: AnyCredential | AnyCredential[];
  id?: string;
  holder?: string | { id: string };
  now?: string | Date;
  version?: 'v1' | 'v2';
  verify?: boolean;
}

export interface SignPresentationOptions {
  presentation: AnyPresentation;
  suite: AnySuite | AnySuite[];
  purpose?: AnyPurpose;
  domain?: string;
  challenge?: string;
  documentLoader?: AnyDocumentLoader;
}

// Proof purpose class
export class CredentialIssuancePurpose {
  term: string;
  controller?: string | object;
  date?: string | Date;
  maxTimestampDelta?: number;

  constructor(options?: {
    controller?: string | object;
    date?: string | Date;
    maxTimestampDelta?: number;
  });

  validate(proof: AnyProof, options: any): Promise<boolean>;
}

// Main API Functions
export function issue(options: IssueOptions): Promise<AnyCredential>;
export function derive(options: DeriveOptions): Promise<AnyCredential>;
export function verify(options: VerifyOptions): Promise<VerifyPresentationResult>;
export function verifyPresentation(options: VerifyOptions): Promise<VerifyPresentationResult>;
export function verifyCredential(options: VerifyCredentialOptions): Promise<VerifyCredentialResult>;
export function createPresentation(options?: CreatePresentationOptions): AnyPresentation;
export function signPresentation(options: SignPresentationOptions): Promise<AnyPresentation>;

// Internal/Helper Functions
export function _checkPresentation(presentation: AnyPresentation): void;
export function _checkCredential(options: any): void;

// Constants
export const defaultDocumentLoader: DocumentLoader;
export const dateRegex: RegExp;
export const contexts: Map<string, object>;
export const CREDENTIALS_CONTEXT_V1_URL: string;
export const CREDENTIALS_CONTEXT_V2_URL: string;
