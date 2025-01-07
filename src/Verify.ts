// import '@digitalcredentials/data-integrity-rn';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import * as vc from '@digitalcredentials/vc';
import { securityLoader } from '@digitalcredentials/security-document-loader';
import { getCredentialStatusChecker } from './credentialStatus';
import { addTrustedIssuersToVerificationResponse } from './issuerRegistries';

import { Credential } from './types/credential';

/* 
// the new eddsa-rdfc-2022-cryptosuite
import {DataIntegrityProof} from '@digitalbazaar/data-integrity';
import {cryptosuite as eddsaRdfc2022CryptoSuite} from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
const suite = new DataIntegrityProof({
  cryptosuite: eddsaRdfc2022CryptoSuite
});  
*/

const documentLoader = securityLoader({ fetchRemoteContexts: true }).build();
const suite = new Ed25519Signature2020();

export interface VerificationError {								
  "message": string,
  "isFatal": boolean,
  "name"?: string,
  stackTrace?: string
}

export interface Step {
  "id": string,
  "valid": boolean,
  "foundInRegistries"?: string[],
}

export interface VerificationResponse {
  "verified": boolean,
  "isFatal": boolean,			
  "credential": object,
  "errors"?: VerificationError[],
  "log"?: Step[]
}


export async function verifyCredential({credential, reloadIssuerRegistry = true}:{credential: Credential, reloadIssuerRegistry: boolean}): Promise<VerificationResponse> {
  
  
  const fatalErrorMessage = checkForFatalErrors(credential)

  if (fatalErrorMessage) {
    return buildFatalErrorObject(fatalErrorMessage, "fatalError", credential, null)
  }

  const verificationResponse = await vc.verifyCredential({
    credential,
    suite,
    documentLoader,
    checkStatus: getCredentialStatusChecker(credential)
  });

  verificationResponse.isFatal = false

  if (verificationResponse.error) {
    if (verificationResponse.error.log) {
      verificationResponse.log = verificationResponse.error.log
      delete verificationResponse.error
    } else if (verificationResponse?.error?.name === 'VerificationError') {
      const fatalErrorMessage = 'The signature is not valid.'
      const stackTrace = verificationResponse?.error?.errors?.stack
      return buildFatalErrorObject(fatalErrorMessage, "invalidSignature", credential, stackTrace)
    }
  }
  console.log('results from the verify call:')
  console.log(JSON.stringify(verificationResponse))

  delete verificationResponse.results
  delete verificationResponse.statusResult
  
  const { issuer } = credential
  await addTrustedIssuersToVerificationResponse({verificationResponse, reloadIssuerRegistry, issuer})
  

  return verificationResponse;
}

function buildFatalErrorObject(fatalErrorMessage: string, name: string, credential: Credential, stackTrace: string | null) : VerificationResponse {
  return {credential, isFatal: true, verified: false, errors: [{name, message: fatalErrorMessage, isFatal: true, ...stackTrace?{stackTrace}:null}]}
}

function checkForFatalErrors(credential: Credential) : string | null {
  try {
    // eslint-disable-next-line no-new
    new URL(credential.id as string);
  } catch (e) {
    return "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement."
  }
  
  if (!credential.proof) {
    return 'This is not a Verifiable Credential - it does not have a digital signature.'
  }

  return null
}


// import { purposes } from '@digitalcredentials/jsonld-signatures';
// import { VerifiablePresentation, PresentationError } from './types/presentation';
// const presentationPurpose = new purposes.AssertionProofPurpose();
// import { extractCredentialsFrom } from './verifiableObject';
