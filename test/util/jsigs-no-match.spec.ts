/**
 * Pins jsonld-signatures 12.0.1's "no proof matched" failure, copied
 * verbatim from `lib/ProofSet.js` and wrapped the way `lib/jsonld-signatures.js`
 * wraps it. An upgrade that rewords or rewraps it should fail here rather
 * than silently report an unchecked proof as a bad signature.
 */

import { describe, it, expect } from 'vitest';
import jsonLdSignatures from '@digitalcredentials/jsonld-signatures';
import { isJsigsNoMatch } from '../../src/util/jsigs-no-match.js';

const NO_MATCH_MESSAGE =
  'Did not verify any proofs; insufficient proofs matched the ' +
  'acceptable suite(s) and required purpose(s).';

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** The wrapper `jsigs.verify` puts around every failure. */
function wrapped(...errors: unknown[]): Error {
  return Object.assign(named('VerificationError', 'Verification error(s).'), {
    errors
  });
}

describe('isJsigsNoMatch', () => {
  it("accepts jsonld-signatures' error, as verify returns it", () => {
    expect(
      isJsigsNoMatch(wrapped(named('NotFoundError', NO_MATCH_MESSAGE)))
    ).toBe(true);
  });

  it('accepts what jsonld-signatures actually returns when no suite matches', async () => {
    const result = (await jsonLdSignatures.verify(
      {
        '@context': 'https://www.w3.org/ns/credentials/v2',
        proof: { type: 'X' }
      },
      {
        suite: [{ type: 'Y', matchProof: async () => false }],
        purpose: new jsonLdSignatures.purposes.AssertionProofPurpose(),
        documentLoader: async (url: string) => ({
          documentUrl: url,
          document: {}
        })
      }
    )) as { verified: boolean; error?: unknown };

    expect(result.verified).toBe(false);
    expect(isJsigsNoMatch(result.error)).toBe(true);
  });

  it('rejects the bare error, which never reaches the crypto service', () => {
    expect(isJsigsNoMatch(named('NotFoundError', NO_MATCH_MESSAGE))).toBe(
      false
    );
  });

  it('rejects the same message under another name', () => {
    expect(isJsigsNoMatch(wrapped(new Error(NO_MATCH_MESSAGE)))).toBe(false);
  });

  it('rejects a NotFoundError with another message', () => {
    expect(
      isJsigsNoMatch(
        wrapped(
          named(
            'NotFoundError',
            'No matching proofs found in the given document.'
          )
        )
      )
    ).toBe(false);
  });

  it("rejects the document loader's NotFoundError message", () => {
    expect(
      isJsigsNoMatch(
        wrapped(
          new Error('NotFoundError loading "https://example.test/ctx": 404')
        )
      )
    ).toBe(false);
  });

  it('rejects a no-match error wrapped with others', () => {
    expect(
      isJsigsNoMatch(
        wrapped(named('NotFoundError', NO_MATCH_MESSAGE), new Error('other'))
      )
    ).toBe(false);
  });

  it('rejects a plain object shaped like the wrapper', () => {
    expect(
      isJsigsNoMatch({
        name: 'VerificationError',
        errors: [named('NotFoundError', NO_MATCH_MESSAGE)]
      })
    ).toBe(false);
  });
});
