// import '@digitalcredentials/data-integrity-rn';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import * as vc from '@digitalcredentials/vc';
import { securityLoader } from '@digitalcredentials/security-document-loader';
import pkg from '@digitalcredentials/jsonld-signatures';

import { getCredentialStatusChecker } from './credentialStatus.js';
import { addTrustedIssuersToVerificationResponse } from './issuerRegistries.js';
import { addSchemaCheckToVerificationResponse } from './schemaCheck.js'
import { extractCredentialsFrom } from './extractCredentialsFrom.js';

import { 
  PRESENTATION_ERROR, UNKNOWN_ERROR, INVALID_JSONLD, NO_VC_CONTEXT, 
  INVALID_CREDENTIAL_ID, NO_PROOF, STATUS_LIST_NOT_FOUND, 
  HTTP_ERROR_WITH_SIGNATURE_CHECK, DID_WEB_UNRESOLVED, 
  INVALID_SIGNATURE } from './constants/errors.js';
import { SIGNATURE_INVALID, SIGNATURE_VALID, SIGNATURE_UNSIGNED, REVOCATION_STATUS_STEP_ID } from './constants/verificationSteps.js';
import { ISSUER_DID_RESOLVES, NOT_FOUND_ERROR, VERIFICATION_ERROR } from './constants/external.js';

import { Credential } from './types/credential.js';
import { VerificationResponse, VerificationStep, PresentationVerificationResponse, PresentationSignatureResult } from './types/result.js';
import { VerifiablePresentation } from './types/presentation.js';

const { purposes } = pkg;
const presentationPurpose = new purposes.AssertionProofPurpose();

const documentLoader = securityLoader({ fetchRemoteContexts: true }).build();

// for verifying eddsa-2022 signatures
const eddsaSuite = new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite });
// for verifying ed25519-2020 signatures
const ed25519Suite = new Ed25519Signature2020();
// add both suites - the vc lib will use whichever is appropriate
const suite = [ed25519Suite, eddsaSuite]

export async function verifyPresentation({ presentation, challenge = 'meaningless', unsignedPresentation = false, knownDIDRegistries }:
  {
    presentation: VerifiablePresentation,
    challenge?: string | null,
    unsignedPresentation?: boolean,
    knownDIDRegistries: object,
    reloadIssuerRegistry?: boolean
  }
): Promise<PresentationVerificationResponse> {
  try {
    const credential = extractCredentialsFrom(presentation)?.find(
      vc => vc.credentialStatus);
    const checkStatus = credential ? getCredentialStatusChecker(credential) : undefined;
    const result = await vc.verify({
      presentation,
      presentationPurpose,
      suite,
      documentLoader,
      unsignedPresentation,
      checkStatus,
      challenge,
      verifyMatchingIssuers: false
    });

    const transformedCredentialResults = await Promise.all(result.credentialResults.map(async (credentialResult: any) => {
      return transformResponse(credentialResult, credentialResult.credential, knownDIDRegistries)
    }));

    // take what we need from the presentation part of the result
    let signature: PresentationSignatureResult;
    if (unsignedPresentation) {
      signature = SIGNATURE_UNSIGNED
    } else {
      signature = result.presentationResult.verified ? SIGNATURE_VALID : SIGNATURE_INVALID
    }
    const errors = result.error ? [{ message: result.error, name: PRESENTATION_ERROR }] : null
    const presentationResult = { signature, ...(errors && { errors }) }

    return { presentationResult, credentialResults: transformedCredentialResults };
  } catch (error) {
    return { errors: [{ message: 'Could not verify presentation.', name: PRESENTATION_ERROR, stackTrace: error }] }
  }
}


export async function verifyCredential({ credential, knownDIDRegistries}: { credential: Credential, knownDIDRegistries: object}): Promise<VerificationResponse> {
  try {
    // null unless credential has a status
    const statusChecker = getCredentialStatusChecker(credential)

    const verificationResponse = await vc.verifyCredential({
      credential,
      suite,
      documentLoader,
      checkStatus: statusChecker,
      verifyMatchingIssuers: false
    });

    const adjustedResponse = await transformResponse(verificationResponse, credential, knownDIDRegistries)
    return adjustedResponse;
  } catch (error) {
    return { errors: [{ message: 'Could not verify credential.', name: UNKNOWN_ERROR, stackTrace: error }] }
  }
}

async function transformResponse(verificationResponse: any, credential: Credential, knownDIDRegistries: object): Promise<VerificationResponse> {

  const fatalCredentialError = handleAnyFatalCredentialErrors(credential)

  if (fatalCredentialError) {
    return fatalCredentialError
  }

  handleAnyStatusError({ verificationResponse, statusResult: verificationResponse.statusResult });

  const fatalSignatureError = handleAnySignatureError({ verificationResponse, credential })
  if (fatalSignatureError) {
    return fatalSignatureError
  }

  const { issuer } = credential
  await addTrustedIssuersToVerificationResponse({ verificationResponse, knownDIDRegistries, issuer })

  await addSchemaCheckToVerificationResponse({verificationResponse, credential})

  // remove things we don't need from the result or that are duplicated elsewhere
  delete verificationResponse.results
  delete verificationResponse.statusResult
  delete verificationResponse.verified
  delete verificationResponse.credentialId
  verificationResponse.log = verificationResponse.log.filter((entry: VerificationStep) => entry.id !== ISSUER_DID_RESOLVES)

  // add things we always want in the response
  verificationResponse.credential = credential

  return verificationResponse as VerificationResponse;
}

function buildFatalErrorObject(fatalErrorMessage: string, name: string, credential: Credential, stackTrace: string | null): VerificationResponse {
  return { credential, errors: [{ name, message: fatalErrorMessage, ...(stackTrace ? { stackTrace } : null) }] };
}

function handleAnyFatalCredentialErrors(credential: Credential): VerificationResponse | null {
  const validVCContexts = [
    'https://www.w3.org/2018/credentials/v1',
    'https://www.w3.org/ns/credentials/v2'
  ]
  const suppliedContexts = credential['@context']

  if (!suppliedContexts) {
    const fatalErrorMessage = "The credential does not appear to be a valid jsonld document - there is no context."
    const name = INVALID_JSONLD
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  if (!validVCContexts.some(contextURI => suppliedContexts.includes(contextURI))) {
    const fatalErrorMessage = "The credential doesn't have a verifiable credential context."
    const name = NO_VC_CONTEXT
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  try {
    // eslint-disable-next-line no-new
    new URL(credential.id as string);
  } catch (e) {
    const fatalErrorMessage = "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement."
    const name = INVALID_CREDENTIAL_ID
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  if (!credential.proof) {
    const fatalErrorMessage = 'This is not a Verifiable Credential - it does not have a digital signature.'
    const name = NO_PROOF
    return buildFatalErrorObject(fatalErrorMessage, name, credential, null)
  }

  return null
}

function handleAnyStatusError({ verificationResponse }: {
  verificationResponse: any,
  statusResult: any
}): void {
  const statusResult = verificationResponse.statusResult
  if (statusResult?.error?.cause?.message?.startsWith(NOT_FOUND_ERROR)) {
    const statusStep = {
      "id": REVOCATION_STATUS_STEP_ID,
      "error": {
        name: STATUS_LIST_NOT_FOUND,
        message: statusResult.error.cause.message
      }
    };
    (verificationResponse.log ??= []).push(statusStep)
  }
}

function handleAnySignatureError({ verificationResponse, credential }: { verificationResponse: any, credential: Credential }): null | VerificationResponse {
  if (verificationResponse.error) {

    if (verificationResponse?.error?.name === VERIFICATION_ERROR) {
      // Can't validate the signature. 
      // Either a bad signature or maybe a did:web that can't
      // be resolved. Because we can't validate the signature, we
      // can't therefore say anything conclusive about the various 
      // steps in verification.
      // So, return a fatal error and no log (because we can't say
      // anything meaningful about the steps in the log)
      let fatalErrorMessage = ""
      let errorName = ""
      // check to see if the error is http related
      const httpError = verificationResponse.error.errors.find((error: any) => error.name === 'HTTPError')
      if (httpError) {
        fatalErrorMessage = 'An http error prevented the signature check.'
        errorName = HTTP_ERROR_WITH_SIGNATURE_CHECK
        // was it caused by a did:web that couldn't be resolved???
        const issuerDID: string = (((credential.issuer) as any).id) || credential.issuer
        if (issuerDID.toLowerCase().startsWith('did:web')) {
          // change did to a url:
          const didUrl = issuerDID.slice(8).replaceAll(':', '/').toLowerCase()
          if (httpError.requestUrl.toLowerCase().includes(didUrl)) {
            fatalErrorMessage = `The signature could not be checked because the public signing key could not be retrieved from ${httpError.requestUrl as string}`
            errorName = DID_WEB_UNRESOLVED
          }
        }
      } else {
        // not an http error, so likely bad signature
        fatalErrorMessage = 'The signature is not valid.'
        errorName = INVALID_SIGNATURE
      }
      const stackTrace = verificationResponse?.error?.errors?.stack
      return buildFatalErrorObject(fatalErrorMessage, errorName, credential, stackTrace)


    } else if (verificationResponse.error.log) {
      // There wasn't actually an error, it is just that one of the
      // steps returned false.
      // So move the log out of the error to the response, since it
      // isn't part of the error
      verificationResponse.log = verificationResponse.error.log
      // delete the error, because again, this wasn't an error, just
      // a false value on one of the steps
      delete verificationResponse.error
    }
  }
  return null
}




