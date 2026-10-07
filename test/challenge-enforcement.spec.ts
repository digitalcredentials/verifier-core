/**
 * `challenge` and `domain` against the real default crypto service.
 *
 * The rule: a supplied challenge is always enforced. The presentation's proof
 * must then use the `authentication` purpose and carry that challenge (and the
 * domain, if one is passed), whatever `proofPurpose` the presentation claims.
 * With no challenge supplied, only the signature is checked. A domain without
 * a challenge fails before any crypto runs.
 *
 * These run offline with real Ed25519 cryptography: `did:key` resolves from the
 * identifier itself and every `@context` used here is bundled, so the
 * `httpGetService` below throws if anything reaches for the network.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  issue,
  signPresentation,
  createPresentation
} from '@digitalcredentials/vc';
import jsonLdSignatures from '@digitalcredentials/jsonld-signatures';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import type { CheckResult } from '../src/types/check.js';

const { purposes } = jsonLdSignatures;

/** Fails loudly rather than silently reaching the network. */
const offlineHttpGetService = {
  async get({ url }: { url: string }): Promise<never> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const documentLoader = defaultDocumentLoaderFor(offlineHttpGetService as never);

const credentialTemplate = (issuerDid: string): Record<string, unknown> => ({
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:uuid:5d2b7c1e-4a8f-4e3b-9c61-2f0a8d7e1b34',
  type: ['VerifiableCredential'],
  issuer: issuerDid,
  validFrom: '2020-01-01T00:00:00Z',
  name: 'Example Credential',
  credentialSubject: { id: 'did:example:subject' }
});

function signatureResult(results: CheckResult[]): CheckResult | undefined {
  return results.find(r => r.check === 'proof.signature');
}

/** The presentation's own proof failed as an invalid signature. */
function expectInvalidSignature(results: CheckResult[]): void {
  const outcome = signatureResult(results)?.outcome;
  expect(outcome?.status).toBe('failure');
  if (outcome?.status === 'failure') {
    expect(outcome.problems[0].title).toBe('Invalid Signature');
  }
}

describe('challenge enforcement with the default crypto service', () => {
  let key: Ed25519VerificationKey2020;
  let holderDid: string;
  let signedCredential: Record<string, unknown>;

  beforeAll(async () => {
    // Fixed seed keeps the DID and the signatures stable across runs.
    key = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(5)
    });
    holderDid = `did:key:${key.fingerprint()}`;
    key.controller = holderDid;
    key.id = `${holderDid}#${key.fingerprint()}`;

    signedCredential = (await issue({
      credential: credentialTemplate(holderDid),
      suite: new Ed25519Signature2020({ key }),
      documentLoader
    })) as Record<string, unknown>;
  });

  const verify = (
    presentation: unknown,
    options: { challenge?: string; domain?: string } = {}
  ) =>
    createVerifier({
      httpGetService: offlineHttpGetService as never,
      documentLoader,
      verbose: true
    }).verifyPresentation({
      presentation,
      ...options,
      phases: ['cryptographic']
    });

  const unsigned = (verifiableCredential = signedCredential) =>
    createPresentation({ verifiableCredential, holder: holderDid });

  const signedForAuthentication = async (
    challenge: string,
    domain?: string,
    verifiableCredential = signedCredential
  ) =>
    (await signPresentation({
      presentation: unsigned(verifiableCredential),
      suite: new Ed25519Signature2020({ key }),
      challenge,
      domain,
      documentLoader
    })) as Record<string, unknown>;

  const signedForAssertion = async () =>
    (await signPresentation({
      presentation: unsigned(),
      suite: new Ed25519Signature2020({ key }),
      purpose: new purposes.AssertionProofPurpose(),
      documentLoader
    })) as Record<string, unknown>;

  it('fails an assertionMethod presentation when a challenge is supplied', async () => {
    const presentation = await signedForAssertion();
    expect((presentation.proof as Record<string, unknown>).proofPurpose).toBe(
      'assertionMethod'
    );

    const result = await verify(presentation, { challenge: 'x' });

    expect(result.verified).toBe(false);
    expectInvalidSignature(result.presentationResults);
  });

  it('fails an authentication presentation signed for a different challenge', async () => {
    const result = await verify(await signedForAuthentication('a'), {
      challenge: 'b'
    });

    expect(result.verified).toBe(false);
    expectInvalidSignature(result.presentationResults);
  });

  it('verifies an authentication presentation with the matching challenge', async () => {
    const result = await verify(await signedForAuthentication('a'), {
      challenge: 'a'
    });

    expect(result.verified).toBe(true);
    expect(signatureResult(result.presentationResults)?.outcome.status).toBe(
      'success'
    );
  });

  describe('domain', () => {
    it('verifies when the challenge and the domain match', async () => {
      const result = await verify(
        await signedForAuthentication('a', 'd.example'),
        { challenge: 'a', domain: 'd.example' }
      );

      expect(result.verified).toBe(true);
    });

    it('fails when the domain differs', async () => {
      const result = await verify(
        await signedForAuthentication('a', 'd.example'),
        { challenge: 'a', domain: 'other.example' }
      );

      expect(result.verified).toBe(false);
      expectInvalidSignature(result.presentationResults);
    });

    it('verifies when no domain is expected', async () => {
      const result = await verify(
        await signedForAuthentication('a', 'd.example'),
        { challenge: 'a' }
      );

      expect(result.verified).toBe(true);
    });
  });

  it('verifies an authentication presentation on its signature when no challenge is supplied', async () => {
    const result = await verify(await signedForAuthentication('a'));

    expect(result.verified).toBe(true);
    expect(signatureResult(result.presentationResults)?.outcome.status).toBe(
      'success'
    );
  });

  it('verifies an assertionMethod presentation when no challenge is supplied', async () => {
    const result = await verify(await signedForAssertion());

    expect(result.verified).toBe(true);
    expect(signatureResult(result.presentationResults)?.outcome.status).toBe(
      'success'
    );
  });

  it('judges the presentation proof apart from a forged embedded credential', async () => {
    const forged = { ...signedCredential, name: 'Forged Credential' };
    const presentation = await signedForAuthentication('a', undefined, forged);

    const result = await verify(presentation, { challenge: 'a' });

    expect(signatureResult(result.presentationResults)?.outcome.status).toBe(
      'success'
    );
    expect(result.credentialResults[0]?.verified).toBe(false);
    expect(result.verified).toBe(false);
  });
});
