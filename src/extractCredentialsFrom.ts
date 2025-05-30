import { Credential } from './types/credential.js';
import { VerifiablePresentation } from './types/presentation.js';

export function extractCredentialsFrom(vp: VerifiablePresentation): Credential[] | null {
    const { verifiableCredential } = vp;
    if (verifiableCredential instanceof Array) {
      return verifiableCredential;
    }
    return [verifiableCredential];
}
