import { describe, it, expect } from 'vitest';
import { IssuerSchema } from '../src/schemas/issuer.js';
import {
  CredentialSchema,
  parseCredential
} from '../src/schemas/credential.js';
import {
  PresentationSchema,
  parsePresentation
} from '../src/schemas/presentation.js';

const ENVELOPED_MESSAGE =
  'Enveloped credentials (VC-JOSE-COSE) are not supported by this verifier.';

/** A v2 credential that passes the gate; override or delete fields per test. */
const baseCredential = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential'],
  issuer: 'did:example:123',
  credentialSubject: { id: 'did:example:456' },
  ...overrides
});

const without = (
  credential: Record<string, unknown>,
  key: string
): Record<string, unknown> => {
  const copy = { ...credential };
  delete copy[key];
  return copy;
};

describe('Zod Envelope Schemas', () => {
  describe('IssuerSchema', () => {
    it('accepts issuer as string', () => {
      const issuer = 'did:example:123';
      const result = IssuerSchema.parse(issuer);
      expect(result).toBe(issuer);
    });

    it('accepts issuer as object', () => {
      const issuer = {
        id: 'did:example:123',
        name: 'Test Issuer'
      };
      const result = IssuerSchema.parse(issuer);
      expect(result).toEqual(issuer);
    });

    it('rejects an issuer object without an id', () => {
      expect(IssuerSchema.safeParse({ name: 'Test Issuer' }).success).toBe(
        false
      );
    });
  });

  describe('CredentialSchema', () => {
    it('parses valid v1 credential', () => {
      const credential = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
        issuer: 'did:example:123',
        issuanceDate: '2024-01-01T00:00:00Z',
        credentialSubject: { id: 'did:example:456' }
      };
      const result = CredentialSchema.parse(credential);
      expect(result).toBeTypeOf('object');
      expect(result.type).toEqual(['VerifiableCredential']);
      expect(result.issuer).toBe('did:example:123');
    });

    it('parses valid v2 credential', () => {
      const credential = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential'],
        issuer: { id: 'did:example:123', name: 'Issuer' },
        credentialSubject: { id: 'did:example:456' }
      };
      const result = CredentialSchema.parse(credential);
      expect(result).toBeTypeOf('object');
      expect(result.issuer).toEqual({
        id: 'did:example:123',
        name: 'Issuer'
      });
    });

    it('parses credential with status as object', () => {
      const credential = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
        issuer: 'did:example:123',
        issuanceDate: '2024-01-01T00:00:00Z',
        credentialSubject: { id: 'did:example:456' },
        credentialStatus: {
          id: 'https://example.com/status#123',
          type: 'BitstringStatusListEntry',
          statusPurpose: 'revocation',
          statusListIndex: '123',
          statusListCredential: 'https://example.com/status'
        }
      };
      const result = CredentialSchema.parse(credential);
      expect(result.credentialStatus).toBeTypeOf('object');
    });

    it('parses credential with an array-valued status type', () => {
      const credential = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
        issuer: 'did:example:123',
        issuanceDate: '2024-01-01T00:00:00Z',
        credentialSubject: { id: 'did:example:456' },
        credentialStatus: {
          id: 'https://example.com/status#123',
          type: ['BitstringStatusListEntry'],
          statusPurpose: 'revocation',
          statusListIndex: '123',
          statusListCredential: 'https://example.com/status'
        }
      };
      const result = CredentialSchema.parse(credential);
      expect(result.credentialStatus).toBeTypeOf('object');
    });

    it('fails on missing @context', () => {
      const credential = {
        type: ['VerifiableCredential'],
        issuer: 'did:example:123',
        issuanceDate: '2024-01-01T00:00:00Z'
      };
      const result = parseCredential(credential);
      expect(result.success).toBe(false);
    });

    it('fails on missing type', () => {
      const credential = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        issuer: 'did:example:123',
        issuanceDate: '2024-01-01T00:00:00Z'
      };
      const result = parseCredential(credential);
      expect(result.success).toBe(false);
    });
  });

  describe('credential gate accepts spec-legal shapes', () => {
    const accepts = (credential: Record<string, unknown>) =>
      expect(parseCredential(credential).success).toBe(true);

    it('accepts a 1EdTechRevocationList status entry', () => {
      accepts(
        baseCredential({
          credentialStatus: {
            id: 'https://example.test/revocations',
            type: '1EdTechRevocationList'
          }
        })
      );
    });

    it('accepts a status entry with only a type', () => {
      accepts(baseCredential({ credentialStatus: { type: 'ExampleStatus' } }));
    });

    it('accepts a BitstringStatusListEntry with no id', () => {
      accepts(
        baseCredential({
          credentialStatus: {
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: '0',
            statusListCredential: 'https://example.test/status/1'
          }
        })
      );
    });

    it('accepts a status entry missing its type (core.vc-structure judges it)', () => {
      accepts(
        baseCredential({
          credentialStatus: { statusListCredential: 'https://example.test/l' }
        })
      );
    });

    it('accepts a language-map name', () => {
      accepts(
        baseCredential({
          name: { '@value': 'Teamwork Badge', '@language': 'en' }
        })
      );
    });

    it('accepts a name with several languages', () => {
      accepts(
        baseCredential({
          name: [
            { '@value': 'Teamwork Badge', '@language': 'en' },
            { '@value': 'Insignia de trabajo en equipo', '@language': 'es' }
          ]
        })
      );
    });

    it('accepts an issuer image with only an id', () => {
      accepts(
        baseCredential({
          issuer: {
            id: 'did:example:123',
            type: ['Profile'],
            name: 'Example',
            image: { id: 'https://example.test/logo.png' }
          }
        })
      );
    });

    it('accepts an issuer name as a language value object', () => {
      accepts(
        baseCredential({
          issuer: {
            id: 'did:example:123',
            name: { '@value': 'Example', '@language': 'en' }
          }
        })
      );
    });

    it('accepts a proof of any shape', () => {
      accepts(baseCredential({ proof: { type: 'ExampleProof' } }));
    });

    it('accepts string-valued @context and type', () => {
      accepts(
        baseCredential({
          '@context': 'https://www.w3.org/ns/credentials/v2',
          type: 'VerifiableCredential'
        })
      );
    });

    it('accepts a type that lacks VerifiableCredential (core.vc-structure judges it)', () => {
      accepts(baseCredential({ type: ['Foo'] }));
    });

    it('does not rewrite what it parses', () => {
      const credential = baseCredential({
        '@context': 'https://www.w3.org/ns/credentials/v2',
        type: 'VerifiableCredential'
      });
      expect(CredentialSchema.parse(credential)).toEqual(credential);
    });
  });

  describe('credential gate rejects', () => {
    const rejectsAt = (
      input: unknown,
      path: Array<string | number>,
      message: string
    ) => {
      const result = parseCredential(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.errors.map(e => ({ path: e.path, message: e.message }))
        ).toContainEqual({ path, message });
      }
    };

    const ISSUER_MESSAGE =
      '"issuer" is required and must be a string or an object with a string "id".';

    it('rejects a non-object', () => {
      expect(parseCredential('not a credential').success).toBe(false);
      expect(parseCredential(null).success).toBe(false);
      expect(parseCredential([baseCredential()]).success).toBe(false);
      rejectsAt(
        'not a credential',
        [],
        'The credential must be a JSON object.'
      );
    });

    it('rejects a missing @context', () => {
      rejectsAt(
        without(baseCredential(), '@context'),
        ['@context'],
        '"@context" is required and must be a string, a context object, or an array of them.'
      );
    });

    it('rejects a missing type', () => {
      rejectsAt(
        without(baseCredential(), 'type'),
        ['type'],
        '"type" is required and must be a string or an array of strings.'
      );
    });

    it('rejects a missing issuer', () => {
      rejectsAt(
        without(baseCredential(), 'issuer'),
        ['issuer'],
        ISSUER_MESSAGE
      );
    });

    it('rejects an issuer object with no id', () => {
      rejectsAt(
        baseCredential({ issuer: { name: 'Example' } }),
        ['issuer'],
        ISSUER_MESSAGE
      );
    });

    it('rejects a missing credentialSubject', () => {
      rejectsAt(
        without(baseCredential(), 'credentialSubject'),
        ['credentialSubject'],
        '"credentialSubject" is required and must be an object or an array of objects.'
      );
    });
  });

  describe('enveloped credentials', () => {
    const enveloped = (type: unknown) => ({
      '@context': 'https://www.w3.org/ns/credentials/v2',
      id: 'data:application/vc+jwt,eyJhbGciOiJFUzI1NiJ9.e30.sig',
      type
    });

    it('rejects an EnvelopedVerifiableCredential with a clear message', () => {
      const result = parseCredential(
        enveloped('EnvelopedVerifiableCredential')
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors).toEqual([
          expect.objectContaining({
            path: ['type'],
            message: ENVELOPED_MESSAGE
          })
        ]);
      }
    });

    it('rejects an array-valued enveloped type the same way', () => {
      const result = parseCredential(
        enveloped(['EnvelopedVerifiableCredential'])
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe(ENVELOPED_MESSAGE);
      }
    });
  });

  describe('PresentationSchema', () => {
    it('parses valid presentation', () => {
      const presentation = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [],
        holder: 'did:example:holder'
      };
      const result = PresentationSchema.parse(presentation);
      expect(result).toBeTypeOf('object');
      expect(result.type).toEqual(['VerifiablePresentation']);
      expect(result.holder).toBe('did:example:holder');
    });

    it('parses presentation with embedded credential', () => {
      const presentation = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential'],
          issuer: 'did:example:123',
          issuanceDate: '2024-01-01T00:00:00Z',
          credentialSubject: { id: 'did:example:456' }
        }
      };
      const result = PresentationSchema.parse(presentation);
      expect(result.verifiableCredential).toBeTypeOf('object');
    });

    it('does not gate embedded credentials', () => {
      const presentation = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [
          { foo: 'bar' },
          {
            '@context': 'https://www.w3.org/ns/credentials/v2',
            id: 'data:application/vc+jwt,eyJhbGciOiJFUzI1NiJ9.e30.sig',
            type: 'EnvelopedVerifiableCredential'
          }
        ]
      };
      expect(parsePresentation(presentation).success).toBe(true);
    });

    it('does not gate the proof', () => {
      const presentation = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiablePresentation'],
        proof: { type: 'ExampleProof' }
      };
      expect(parsePresentation(presentation).success).toBe(true);
    });

    it('rejects a missing type', () => {
      const presentation = {
        '@context': ['https://www.w3.org/ns/credentials/v2']
      };
      expect(parsePresentation(presentation).success).toBe(false);
    });

    describe('holder', () => {
      const withHolder = (holder: unknown) => ({
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [],
        holder
      });

      it('parses a holder object with an id', () => {
        const result = PresentationSchema.parse(
          withHolder({ id: 'did:example:holder' })
        );
        expect(result.holder).toEqual({ id: 'did:example:holder' });
      });

      it('preserves extra properties on a holder object', () => {
        const result = PresentationSchema.parse(
          withHolder({ id: 'did:example:holder', name: 'Alice' })
        );
        expect(result.holder).toEqual({
          id: 'did:example:holder',
          name: 'Alice'
        });
      });

      it('parses a presentation with no holder', () => {
        const presentation = {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiablePresentation'],
          verifiableCredential: []
        };
        expect(parsePresentation(presentation).success).toBe(true);
      });

      it('rejects a holder object without an id', () => {
        expect(parsePresentation(withHolder({ name: 'Alice' })).success).toBe(
          false
        );
      });

      it('rejects a holder object with a non-string id', () => {
        expect(parsePresentation(withHolder({ id: 42 })).success).toBe(false);
      });

      it('rejects a non-string, non-object holder', () => {
        expect(parsePresentation(withHolder(42)).success).toBe(false);
      });

      it('explains a rejected holder in plain words', () => {
        const result = parsePresentation(withHolder(42));
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors.map(e => e.message)).toEqual([
            '"holder" must be a string or an object with a string "id".'
          ]);
        }
      });
    });

    it('returns error on parse failure', () => {
      const presentation = {
        type: ['VerifiablePresentation'], // missing @context
        holder: 'did:example:holder'
      };
      const result = parsePresentation(presentation);
      expect(result.success).toBe(false);
    });
  });
});
