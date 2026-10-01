import { describe, it, expect } from 'vitest';
import { decodeList } from '@digitalcredentials/vc-bitstring-status-list';
import { compose } from './compose.js';
import { CredentialFactory } from './credential-factory.js';
import { DidDocumentFactory } from './did-document-factory.js';
import { PresentationFactory } from './presentation-factory.js';
import { StatusListCredentialFactory } from './status-list-factory.js';
import { addResults } from './transforms.js';

describe('data factories', () => {
  it('CredentialFactory() produces a v2-shaped OpenBadge credential', () => {
    const cred = CredentialFactory();
    expect(cred['@context']).toContain('https://www.w3.org/ns/credentials/v2');
    expect(cred.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential']);
    expect(cred).toHaveProperty('validFrom');
    expect(cred).not.toHaveProperty('issuanceDate');
    expect(cred.proof).toBeTypeOf('object');
    expect((cred.proof as { type?: string }).type).toBe('Ed25519Signature2020');
  });

  it("CredentialFactory({ version: 'v1' }) uses issuanceDate", () => {
    const cred = CredentialFactory({ version: 'v1', credential: {} });
    expect(cred['@context']).toContain(
      'https://www.w3.org/2018/credentials/v1'
    );
    expect(cred).toHaveProperty('issuanceDate');
    expect(cred).not.toHaveProperty('validFrom');
  });

  it('compose + addResults cross-references results and descriptions', () => {
    const cred = compose(
      CredentialFactory({ credential: {} }),
      addResults({ count: 3 })
    );
    const cs = cred.credentialSubject as Record<string, unknown>;
    const achievement = cs.achievement as Record<string, unknown>;
    const results = cs.result as Array<{ resultDescription?: string }>;
    const descs = achievement.resultDescription as Array<{ id: string }>;

    expect(results).toHaveLength(3);
    expect(descs).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(results[i].resultDescription).toBe(descs[i].id);
    }
  });

  it('PresentationFactory() produces a VP-shaped object', () => {
    const vp = PresentationFactory();
    expect(vp.type).toEqual(['VerifiablePresentation']);
    expect(vp.verifiableCredential).toBeInstanceOf(Array);
    expect(vp.verifiableCredential as unknown[]).toHaveLength(1);
    expect(vp.proof).toBeTypeOf('object');
  });

  it('DidDocumentFactory() includes verificationMethod and references', () => {
    const doc = DidDocumentFactory();
    expect(doc.verificationMethod).toBeInstanceOf(Array);
    expect((doc.verificationMethod as unknown[]).length).toBeGreaterThanOrEqual(
      1
    );
    expect(doc.authentication).toBeInstanceOf(Array);
    expect(doc.assertionMethod).toBeInstanceOf(Array);
  });

  it('StatusListCredentialFactory sets revoked bits', async () => {
    const sl = await StatusListCredentialFactory({ revokedIndexes: [3] });
    const subject = sl.credentialSubject as { encodedList: string };
    const list = await decodeList({ encodedList: subject.encodedList });
    expect(list.getStatus(3)).toBe(true);
    expect(list.getStatus(0)).toBe(false);
  });
});
