/*!
 * Copyright (c) 2025 Digital Credentials Consortium.
 * All rights reserved.
 */

import {
  DEFAULT_ALLOWED_SCHEMES,
  DEFAULT_MAX_URL_LENGTH,
  RESERVED_HOSTNAMES,
  RESERVED_HOST_SUFFIXES
} from './constants/url.js';
import type {
  UrlSafetyMatcherResult,
  UrlSafetyOptions,
  UrlSafetyResult,
  UrlSafetyStatus,
  UrlValidationOptions,
  UrlValidationReason,
  UrlValidationResult
} from './types/url.js';

const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s/$.?#].[^\s]*$/i;
const HOSTNAME_TLD_PATTERN = /[a-z\u00a1-\uffff]{2,}$/i;
const HOST_LABEL_PATTERN = /^[a-z0-9-]+$/i;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_SEGMENT = '[0-9a-fA-F]{1,4}';
const IPV6_PATTERN = new RegExp(
  '^(' +
    `(?:${IPV6_SEGMENT}:){7}${IPV6_SEGMENT}|` +
    `(?:${IPV6_SEGMENT}:){1,7}:|` +
    `(?:${IPV6_SEGMENT}:){1,6}:${IPV6_SEGMENT}|` +
    `(?:${IPV6_SEGMENT}:){1,5}(?::${IPV6_SEGMENT}){1,2}|` +
    `(?:${IPV6_SEGMENT}:){1,4}(?::${IPV6_SEGMENT}){1,3}|` +
    `(?:${IPV6_SEGMENT}:){1,3}(?::${IPV6_SEGMENT}){1,4}|` +
    `(?:${IPV6_SEGMENT}:){1,2}(?::${IPV6_SEGMENT}){1,5}|` +
    `${IPV6_SEGMENT}:(?::${IPV6_SEGMENT}){1,6}|` +
    ':(?::' + IPV6_SEGMENT + '){1,7}' +
    ')(%[0-9a-zA-Z]{1,})?$'
);

const STATUS_RANK: Record<UrlSafetyStatus, number> = {
  safe: 0,
  suspicious: 1,
  blocked: 2
};

/**
 * Normalize hostnames for comparisons.
 */
function normalizeHost(hostname: string): string {
  return hostname.trim().replace(/\.+$/, '').toLowerCase();
}

function hasValidTld(hostname: string): boolean {
  const labels = hostname.split('.');
  if (labels.length < 2) {
    return false;
  }

  const tld = labels[labels.length - 1];
  return HOSTNAME_TLD_PATTERN.test(tld);
}

function isExplicitlyBlocked(
  hostname: string,
  { blockedHosts, allowedHosts }: UrlValidationOptions
): UrlValidationReason | null {
  if (allowedHosts?.some(host => normalizeHost(host) === hostname)) {
    return null;
  }
  if (blockedHosts?.some(host => normalizeHost(host) === hostname)) {
    return 'blocked_host';
  }
  return null;
}

function isPrivateHostname(hostname: string): boolean {
  if (RESERVED_HOSTNAMES.includes(hostname)) {
    return true;
  }

  if (RESERVED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
    return true;
  }

  if (isIPv4Address(hostname)) {
    return isPrivateIPv4(hostname);
  }

  if (isIPv6Address(hostname)) {
    return isPrivateIPv6(hostname);
  }

  return false;
}

function isIPv4Address(value: string): boolean {
  if (!IPV4_PATTERN.test(value)) {
    return false;
  }

  return value.split('.').every(segment => {
    const numeric = Number(segment);
    return numeric >= 0 && numeric <= 255;
  });
}

function isIPv6Address(value: string): boolean {
  return IPV6_PATTERN.test(value);
}

function isPrivateIPv4(ip: string): boolean {
  const [aStr, bStr, cStr] = ip.split('.');
  const a = Number(aStr);
  const b = Number(bStr);
  const c = Number(cStr);

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (c === 0 || c === 1)) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') {
    return true;
  }

  const cleaned = lower.split('%')[0];
  const firstHextet = cleaned.split(':')[0] || '0';
  const first = parseInt(firstHextet, 16);

  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }

  return false;
}

export function parseAndValidateUrl(
  value: string,
  options: UrlValidationOptions = {}
): UrlValidationResult {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }

  const {
    allowedSchemes = [...DEFAULT_ALLOWED_SCHEMES],
    maxLength = DEFAULT_MAX_URL_LENGTH,
    requireTld = true,
    allowPrivateHosts = false
  } = options;

  if (trimmed.length > maxLength) {
    return { ok: false, reason: 'too_long' };
  }

  if (!URL_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'invalid_format' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_format' };
  }

  const scheme = parsed.protocol.replace(/:$/, '');

  if (!allowedSchemes.includes(scheme)) {
    return { ok: false, reason: 'disallowed_scheme' };
  }

  const hostname = normalizeHost(parsed.hostname);
  if (!hostname) {
    return { ok: false, reason: 'missing_hostname' };
  }

  if (hostname.split('.').some(label => label.length === 0 || !HOST_LABEL_PATTERN.test(label))) {
    return { ok: false, reason: 'invalid_format' };
  }

  if (!allowPrivateHosts && isPrivateHostname(hostname)) {
    return { ok: false, reason: 'private_host' };
  }

  if (requireTld && !hasValidTld(hostname)) {
    return { ok: false, reason: 'missing_tld' };
  }

  const blockedReason = isExplicitlyBlocked(hostname, options);
  if (blockedReason) {
    return { ok: false, reason: blockedReason };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    hostname
  };
}

export async function checkUrlSafety(
  urlInput: string,
  options: UrlSafetyOptions = {}
): Promise<UrlSafetyResult> {
  const validation = parseAndValidateUrl(urlInput, {
    allowPrivateHosts: true,
    requireTld: false
  });

  if (!validation.ok || !validation.normalizedUrl) {
    return {
      url: urlInput,
      status: 'blocked',
      reasons: [`validation:${validation.reason ?? 'invalid_format'}`]
    };
  }

  const normalizedHost = validation.hostname ?? new URL(validation.normalizedUrl).hostname;
  let reasons: string[] = [];
  let status: UrlSafetyStatus = 'safe';

  if (matchesList(options.allowlist, normalizedHost)) {
    return { url: validation.normalizedUrl, status: 'safe', reasons: ['allowlist'] };
  }

  if (matchesList(options.blocklist, normalizedHost)) {
    return { url: validation.normalizedUrl, status: 'blocked', reasons: ['blocklist'] };
  }

  if (options.matchers?.length) {
    for (const matcher of options.matchers) {
      const result = await matcher(new URL(validation.normalizedUrl));
      if (!result) continue;
      ({ status, reasons } = pickStronger(status, reasons, result));
      if (status === 'blocked') {
        break;
      }
    }
  }

  return { url: validation.normalizedUrl, status, reasons };
}

function matchesList(list: Iterable<string> | undefined, hostname: string): boolean {
  if (!list) {
    return false;
  }

  for (const entry of list) {
    const candidate = entry.trim().toLowerCase();
    if (!candidate) {
      continue;
    }

    if (hostname === candidate || hostname.endsWith(`.${candidate}`)) {
      return true;
    }
  }

  return false;
}

function pickStronger(
  currentStatus: UrlSafetyStatus,
  reasons: string[],
  update: UrlSafetyMatcherResult
): { status: UrlSafetyStatus; reasons: string[] } {
  if (STATUS_RANK[update.status] > STATUS_RANK[currentStatus]) {
    return { status: update.status, reasons: [update.reason] };
  }

  if (STATUS_RANK[update.status] === STATUS_RANK[currentStatus]) {
    return { status: currentStatus, reasons: [...reasons, update.reason] };
  }

  return { status: currentStatus, reasons };
}

