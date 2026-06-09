/*!
 * Copyright (c) 2025 Digital Credentials Consortium.
 * All rights reserved.
 */

import type { UrlValidationOptions } from '../types/url.js';

export type ValidUrlFixture = {
  value: string;
  hostname?: string;
  options?: UrlValidationOptions;
};

export type InvalidUrlFixture = {
  value: string;
  reason: string;
  options?: UrlValidationOptions;
};

export const validUrlFixtures: ValidUrlFixture[] = [
  {
    value: 'https://example.org/path?foo=bar#hash',
    hostname: 'example.org'
  },
  {
    value: 'http://sub.example.com/resource',
    hostname: 'sub.example.com'
  },
  {
    value: 'https://10.0.0.5/data',
    hostname: '10.0.0.5',
    options: { allowPrivateHosts: true, requireTld: false }
  }
];

export const invalidUrlFixtures: InvalidUrlFixture[] = [
  {
    value: '',
    reason: 'empty'
  },
  {
    value: 'ftp://example.org',
    reason: 'disallowed_scheme'
  },
  {
    value: 'https://192.168.1.20',
    reason: 'private_host'
  },
  {
    value: 'https://intranet',
    reason: 'missing_tld'
  },
  {
    value: 'https://danger.example.com',
    reason: 'blocked_host',
    options: { blockedHosts: ['danger.example.com'] }
  }
];

