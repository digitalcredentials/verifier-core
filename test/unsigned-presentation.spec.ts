/**
 * `unsignedPresentation` against the real default crypto service.
 *
 * The rule: a presentation must be signed unless the caller passes
 * `unsignedPresentation: true`, and a proof that is present is always verified,
 * whatever the flag says. `@digitalcredentials/vc` reads its own
 * `unsignedPresentation` as "skip the presentation proof", so forwarding the
 * caller's flag let a tampered holder signature verify.
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
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import type { CheckResult } from '../src/types/check.js';

/** Fails loudly rather than silently reaching the network. */
const offlineHttpGetService = {
  async get({ url }: { url: string }): Promise<never> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const documentLoader = defaultDocumentLoaderFor(offlineHttpGetService as never);

const CHALLENGE = 'test-challenge';

const credentialTemplate = (issuerDid: string): Record<string, unknown> => ({
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:uuid:0c4a1f5e-8f33-4d0e-9b77-3a1d2e6f8c90',
  type: ['VerifiableCredential'],
  issuer: issuerDid,
  validFrom: '2020-01-01T00:00:00Z',
  name: 'Example Credential',
  credentialSubject: { id: 'did:example:subject' }
});

function signatureResult(results: CheckResult[]): CheckResult | undefined {
  return results.find(r => r.check === 'proof.signature');
}

describe('unsignedPresentation with the default crypto service', () => {
  let key: Ed25519VerificationKey2020;
  let issuerDid: string;
  let signedCredential: Record<string, unknown>;

  beforeAll(async () => {
    // Fixed seed keeps the DID and the signatures stable across runs.
    key = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(3)
    });
    issuerDid = `did:key:${key.fingerprint()}`;
    key.controller = issuerDid;
    key.id = `${issuerDid}#${key.fingerprint()}`;

    signedCredential = (await issue({
      credential: credentialTemplate(issuerDid),
      suite: new Ed25519Signature2020({ key }),
      documentLoader
    })) as Record<string, unknown>;
  });

  const verify = (presentation: unknown, unsignedPresentation?: boolean) =>
    createVerifier({
      httpGetService: offlineHttpGetService as never,
      documentLoader,
      verbose: true
    }).verifyPresentation({
      presentation,
      challenge: CHALLENGE,
      unsignedPresentation,
      phases: ['cryptographic']
    });

  const unsigned = (verifiableCredential: Record<string, unknown>) =>
    createPresentation({ verifiableCredential, holder: issuerDid });

  const signed = async () =>
    (await signPresentation({
      presentation: unsigned(signedCredential),
      suite: new Ed25519Signature2020({ key }),
      challenge: CHALLENGE,
      documentLoader
    })) as Record<string, unknown>;

  it('skips the signature of an unsigned presentation when the flag is set', async () => {
    const result = await verify(unsigned(signedCredential), true);

    expect(result.verified).toBe(true);
    expect(signatureResult(result.presentationResults)?.outcome).toEqual({
      status: 'skipped',
      reason:
        'Presentation is unsigned; accepted because unsignedPresentation is set.'
    });
    expect(result.credentialResults[0]?.verified).toBe(true);
  });

  it('fails an unsigned presentation when the flag is unset', async () => {
    const result = await verify(unsigned(signedCredential));

    expect(result.verified).toBe(false);
    const outcome = signatureResult(result.presentationResults)?.outcome;
    expect(outcome?.status).toBe('failure');
    if (outcome?.status === 'failure') {
      expect(outcome.problems[0].title).toBe('Presentation Not Signed');
    }
    expect(JSON.stringify(result)).not.toContain(
      'No Applicable Crypto Service'
    );
  });

  it('still verifies a tampered presentation proof when the flag is set', async () => {
    const presentation = await signed();
    const proof = presentation.proof as Record<string, unknown>;
    const proofValue = proof.proofValue as string;
    presentation.proof = {
      ...proof,
      proofValue: `${proofValue.slice(0, -4)}AAAA`
    };

    const result = await verify(presentation, true);

    expect(result.verified).toBe(false);
    const outcome = signatureResult(result.presentationResults)?.outcome;
    expect(outcome?.status).toBe('failure');
    if (outcome?.status === 'failure') {
      expect(outcome.problems[0].title).toBe('Invalid Signature');
    }
  });

  it('verifies a signed presentation normally when the flag is set', async () => {
    const result = await verify(await signed(), true);

    expect(result.verified).toBe(true);
    expect(signatureResult(result.presentationResults)?.outcome.status).toBe(
      'success'
    );
  });

  it('fails an unsigned presentation wrapping a forged credential', async () => {
    const forged = { ...signedCredential, name: 'Forged Credential' };

    const result = await verify(unsigned(forged), true);

    expect(result.verified).toBe(false);
    expect(result.credentialResults[0]?.verified).toBe(false);
  });
});
