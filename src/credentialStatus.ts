import { checkStatus } from '@digitalcredentials/vc-bitstring-status-list';
import { Credential } from './types/credential.js';

export enum StatusPurpose {
  Revocation = 'revocation',
  Suspension = 'suspension'
}

export function getCredentialStatusChecker(credential: Credential) : (() => boolean) | null  {
  let statusChecker = null;
  if (!credential.credentialStatus) {
    return null;
  }
  const credentialStatuses = Array.isArray(credential.credentialStatus) ?
    credential.credentialStatus :
    [credential.credentialStatus];
  const [credentialStatus] = credentialStatuses;
  if (credentialStatus.type === 'BitstringStatusListEntry') {
    statusChecker = checkStatus;
  }
  return statusChecker;
  
}

