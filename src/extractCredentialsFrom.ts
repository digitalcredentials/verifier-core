import { Credential } from './types/credential.js';
import { VerifiablePresentation } from './types/presentation';

/**
 * This type is used to identify a request response that could be a
 * Verifiable Credential or Verifiable Presentation.
 */
export type VerifiableObject = Credential | VerifiablePresentation;

export function isVerifiableCredential(obj: VerifiableObject): obj is Credential {
  return obj.type?.includes('VerifiableCredential');
}

export function isVerifiablePresentation(obj: VerifiableObject): obj is VerifiablePresentation {
  return obj.type?.includes('VerifiablePresentation');
}

export function extractCredentialsFrom(obj: VerifiableObject): Credential[] | null {
  if (isVerifiableCredential(obj)) {
    return [obj];
  }

  if (isVerifiablePresentation(obj)) {
    const { verifiableCredential } = obj;

    if (verifiableCredential instanceof Array) {
      return verifiableCredential;
    }
    return [verifiableCredential];
  }

  return null;
}
