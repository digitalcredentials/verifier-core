// import '@digitalcredentials/data-integrity-rn';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import * as vc from '@digitalcredentials/vc';
import { securityLoader } from '@digitalcredentials/security-document-loader';
import { getCredentialStatusChecker } from './credentialStatus.js';
import { addTrustedIssuersToVerificationResponse } from './issuerRegistries.js';

import { Credential } from './types/credential.js';
import { VerificationResponse } from './types/result.js';

const documentLoader = securityLoader({ fetchRemoteContexts: true }).build();

// for verifying eddsa-2022 signatures
const eddsaSuite = new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite });

// for verifying ed25519-2020 signatures
const ed25519Suite = new Ed25519Signature2020();

export async function verifyCredential({ credential, knownDIDRegistries, reloadIssuerRegistry = true }: { credential: Credential, knownDIDRegistries: object, reloadIssuerRegistry: boolean }): Promise<VerificationResponse> {

  const fatalError = checkForFatalErrors(credential)

  if (fatalError) {
    return fatalError
  }

  const suite = (credential?.proof?.cryptosuite === 'eddsa-rdfc-2022') ?
    eddsaSuite : ed25519Suite

  const verificationResponse = await vc.verifyCredential({
    credential,
    suite,
    documentLoader,
    checkStatus: getCredentialStatusChecker(credential)
  });

  // remove things we don't need from the result or that are duplicated elsewhere
  delete verificationResponse.results
  delete verificationResponse.statusResult
  delete verificationResponse.verified

  verificationResponse.isFatal = false
  verificationResponse.credential = credential

  if (verificationResponse.error) {
    if (verificationResponse.error.log) {
      // move the log out of the error to the response, since it
      // isn't part of the error, but rather the true/false values
      // for each step in verification
      verificationResponse.log = verificationResponse.error.log
      // delete the error, because again, this wasn't an error, just
      // a false value on one of the steps
      delete verificationResponse.error
    } else if (verificationResponse?.error?.name === 'VerificationError') {
      // this is in fact an error so return a fatal error.
      // this means something happened (likely a bad signature) that prevents us from 
      // saying anything conclusive about the various steps in verification
      const fatalErrorMessage = 'The signature is not valid.'
      const stackTrace = verificationResponse?.error?.errors?.stack
      return buildFatalErrorObject(fatalErrorMessage, "invalid_signature", credential, stackTrace)
    }
  }

  const { issuer } = credential
  await addTrustedIssuersToVerificationResponse({ verificationResponse, knownDIDRegistries, reloadIssuerRegistry, issuer })

  return verificationResponse;
}

function buildFatalErrorObject(fatalErrorMessage: string, name: string, credential: Credential, stackTrace: string | null): VerificationResponse {
  return { credential, isFatal: true, errors: [{ name, message: fatalErrorMessage, isFatal: true, ...stackTrace ? { stackTrace } : null }] }
}

function checkForFatalErrors(credential: Credential): VerificationResponse | null {
  const validVCContexts = [
    'https://www.w3.org/2018/credentials/v1',
    'https://www.w3.org/ns/credentials/v2'
  ]
  const suppliedContexts = credential['@context']

  if (!suppliedContexts) {
    const fatalErrorMessage = "The credential does not appear to be a valid jsonld document - there is no context."
    const name = 'invalid_jsonld'
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  if (!validVCContexts.some(contextURI => suppliedContexts.includes(contextURI))) {
    const fatalErrorMessage = "The credential doesn't have a verifiable credential context."
    const name = 'no_vc_context'
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  try {
    // eslint-disable-next-line no-new
    new URL(credential.id as string);
  } catch (e) {
    const fatalErrorMessage = "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement."
    const name = 'invalid_credential_id'
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  if (!credential.proof) {
    const fatalErrorMessage = 'This is not a Verifiable Credential - it does not have a digital signature.'
    const name = 'no_proof'
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  return null
}


// import { purposes } from '@digitalcredentials/jsonld-signatures';
// import { VerifiablePresentation, PresentationError } from './types/presentation';
// const presentationPurpose = new purposes.AssertionProofPurpose();
// import { extractCredentialsFrom } from './verifiableObject';
