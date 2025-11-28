/*!
 * Copyright (c) 2025 Digital Credentials Consortium.
 * All rights reserved.
 */

export type UrlValidationReason =
  | 'empty'
  | 'too_long'
  | 'invalid_format'
  | 'disallowed_scheme'
  | 'missing_hostname'
  | 'missing_tld'
  | 'private_host'
  | 'blocked_host';

export interface UrlValidationOptions {
  allowedSchemes?: string[];
  maxLength?: number;
  requireTld?: boolean;
  allowPrivateHosts?: boolean;
  blockedHosts?: string[];
  allowedHosts?: string[];
}

export interface UrlValidationResult {
  ok: boolean;
  normalizedUrl?: string;
  hostname?: string;
  reason?: UrlValidationReason;
}

export type UrlSafetyStatus = 'safe' | 'suspicious' | 'blocked';

export interface UrlSafetyResult {
  url: string;
  status: UrlSafetyStatus;
  reasons: string[];
}

export type UrlSafetyMatcher =
  | ((url: URL) => Promise<UrlSafetyMatcherResult | null>)
  | ((url: URL) => UrlSafetyMatcherResult | null);

export interface UrlSafetyMatcherResult {
  status: UrlSafetyStatus;
  reason: string;
}

export interface UrlSafetyOptions {
  blocklist?: Iterable<string>;
  allowlist?: Iterable<string>;
  matchers?: UrlSafetyMatcher[];
}

