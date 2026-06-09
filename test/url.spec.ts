/*!
 * Copyright (c) 2025 Digital Credentials Consortium.
 * All rights reserved.
 */

import { expect } from 'chai';

import { checkUrlSafety, parseAndValidateUrl } from '../src/index.js';
import { invalidUrlFixtures, validUrlFixtures } from '../src/test-fixtures/url.js';

describe('URL utilities', () => {
  describe('parseAndValidateUrl', () => {
    validUrlFixtures.forEach(({ value, hostname, options }) => {
      it(`accepts ${value}`, () => {
        const result = parseAndValidateUrl(value, options as any);
        expect(result.ok).to.be.true;
        if (hostname) {
          expect(result.hostname).to.equal(hostname);
        }
      });
    });

    invalidUrlFixtures.forEach(({ value, reason, options }) => {
      it(`rejects ${value || '<empty>'}`, () => {
        const result = parseAndValidateUrl(value, options as any);
        expect(result.ok).to.be.false;
        expect(result.reason).to.equal(reason);
      });
    });
  });

  describe('checkUrlSafety', () => {
    it('respects allowlists before other checks', async () => {
      const result = await checkUrlSafety('https://safe.example.edu', {
        allowlist: ['example.edu'],
        blocklist: ['malicious.com']
      });
      expect(result.status).to.equal('safe');
      expect(result.reasons).to.deep.equal(['allowlist']);
    });

    it('applies custom matchers', async () => {
      const result = await checkUrlSafety('https://flagged.example.com', {
        matchers: [
          async url => {
            if (url.hostname === 'flagged.example.com') {
              return { status: 'suspicious', reason: 'demo_matcher' };
            }
            return null;
          }
        ]
      });
      expect(result.status).to.equal('suspicious');
      expect(result.reasons).to.deep.equal(['demo_matcher']);
    });
  });
});

