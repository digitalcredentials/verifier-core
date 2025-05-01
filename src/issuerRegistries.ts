import {RegistryClient, LookupResult} from '@digitalcredentials/issuer-registry-client';
import { VerificationResponse, RegistryListResult } from './types/result.js';
import { REGISTERED_ISSUER_STEP_ID } from './constants/verificationSteps.js';
const registryClient = new RegistryClient()

/**
 * Checks to see if a VC's issuer appears in any of the known DID registries.
 *
 * @returns An object containing a list of the names of the DID registries in 
 * which the issuer appears and a list of registries that couldn't be loaded
 */

export async function getTrustedRegistryListForIssuer({ issuer, knownDIDRegistries}: {
  issuer: string | any,
  knownDIDRegistries: object
}): Promise<LookupResult> {

  const issuerDid = typeof issuer === 'string' ? issuer : issuer.id;
  await registryClient.use({ registries: knownDIDRegistries })
  const results = await registryClient.lookupIssuersFor(issuerDid);
  return results 

}

export async function addTrustedIssuersToVerificationResponse( {issuer, knownDIDRegistries, verificationResponse} :{
  issuer: string | any,
  knownDIDRegistries: object,
  verificationResponse: VerificationResponse
}) : Promise<void>
 {
    const {matchingIssuers,uncheckedRegistries}  = await getTrustedRegistryListForIssuer( {issuer, knownDIDRegistries});

    const registryStep = {
      "id": REGISTERED_ISSUER_STEP_ID,
      "valid": !!matchingIssuers.length,
      matchingIssuers,
      uncheckedRegistries
  };

    (verificationResponse.log ??= []).push(registryStep)

}

