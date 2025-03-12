import { checkStatus } from '@digitalcredentials/vc-bitstring-status-list';
import { Credential } from './types/credential.js';

export enum StatusPurpose {
  Revocation = 'revocation',
  Suspension = 'suspension'
}

export function getCredentialStatusChecker(credential: Credential) : (() => boolean) | null  {

  if (!credential.credentialStatus) {
    return null;
  }
  const credentialStatuses = Array.isArray(credential.credentialStatus) ?
    credential.credentialStatus :
    [credential.credentialStatus];
  const [credentialStatus] = credentialStatuses;

 switch (credentialStatus.type) {
  case 'BitstringStatusListEntry':
    return checkStatus;
  case 'StatusList2021Entry':
    // old spec - ignore
    return ()=>{return true};
  case '1EdTechRevocationList':
    // old spec - ignore
    return ()=>{return true}
  default:
    return null;
  }
  
}

