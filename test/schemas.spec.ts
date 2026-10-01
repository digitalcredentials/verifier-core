import { describe, it, expect } from 'vitest';
import { JsonLdField } from '../src/schemas/jsonld-field.js';
import { IssuerSchema } from '../src/schemas/issuer.js';
import { ProofSchema } from '../src/schemas/proof.js';
import {
  CredentialSchema,
  parseCredential
} from '../src/schemas/credential.js';
import {
  PresentationSchema,
  parsePresentation
} from '../src/schemas/presentation.js';
import { z } from 'zod';

describe('Zod Envelope Schemas', () => {
  describe('JsonLdField', () => {
    it('normalizes single value to array', () => {
      const schema = JsonLdField(z.string());
      const result = schema.parse('single');
      expect(result).toEqual(['single']);
    });

    it('keeps array as array', () => {
      const schema = JsonLdField(z.string());
      const result = schema.parse(['a', 'b']);
      expect(result).toEqual(['a', 'b']);
    });
  });

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
  });

  describe('ProofSchema', () => {
    it('parses minimal proof', () => {
      const proof = {
        type: 'Ed25519Signature2020',
        proofPurpose: 'assertionMethod',
        verificationMethod: 'did:example:123#key-1'
      };
      const result = ProofSchema.parse(proof);
      expect(result.type).toBe('Ed25519Signature2020');
      expect(result.proofPurpose).toBe('assertionMethod');
    });

    it('parses proof with optional fields', () => {
      const proof = {
        type: 'DataIntegrityProof',
        proofPurpose: 'authentication',
        verificationMethod: 'did:example:123#key-1',
        created: '2024-01-01T00:00:00Z',
        proofValue: 'z123',
        cryptosuite: 'eddsa-rdfc-2022',
        challenge: 'abc123'
      };
      const result = ProofSchema.parse(proof);
      expect(result.cryptosuite).toBe('eddsa-rdfc-2022');
      expect(result.challenge).toBe('abc123');
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

    it('parses credential with status as array (normalized)', () => {
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
