import {RegistryClient, LoadResult} from '@digitalcredentials/issuer-registry-client';
import { VerificationResponse, RegistryListResult } from './types/result.js';
import { REGISTERED_ISSUER_STEP_ID } from './constants/verificationSteps.js';
const registries = new RegistryClient()
const registryNotYetLoaded = true;

/**
 * Checks to see if a VC's issuer appears in any of the known DID registries.
 *
 * @returns An object containing a list of the names of the DID registries in 
 * which the issuer appears and a list of registries that couldn't be loaded
 */

export async function getTrustedRegistryListForIssuer({ issuer, knownDIDRegistries, reloadIssuerRegistry = false }: {
  issuer: string | any,
  knownDIDRegistries: object,
  reloadIssuerRegistry: boolean | null
}): Promise<RegistryListResult> {

  let registryLoadResult:LoadResult[] = []
  // eslint-disable-next-line no-use-before-define
  if (reloadIssuerRegistry || registryNotYetLoaded) {
     registryLoadResult = await registries.load({ config: knownDIDRegistries })
  }
  const registriesNotLoaded : Array<{name: string, url: string}> = registryLoadResult.filter((registry:LoadResult)=>!registry.loaded).map(entry=>{return {name:entry.name, url:entry.url}})
  const issuerDid = typeof issuer === 'string' ? issuer : issuer.id;
  const issuerInfo = registries.didEntry(issuerDid);
  // See if the issuer DID appears in any of the known registries
  // If yes, assemble a list of registries in which it appears
  const foundInRegistries = issuerInfo?.inRegistries
    ? Array.from(issuerInfo.inRegistries).map(r => r.name)
    : []

  return {foundInRegistries, registriesNotLoaded}

}

export async function addTrustedIssuersToVerificationResponse( {issuer, knownDIDRegistries, reloadIssuerRegistry = false, verificationResponse} :{
  issuer: string | any,
  reloadIssuerRegistry: boolean | null,
  knownDIDRegistries: object,
  verificationResponse: VerificationResponse
}) : Promise<void>
 {
    const {foundInRegistries,registriesNotLoaded}  = await getTrustedRegistryListForIssuer( {issuer, knownDIDRegistries, reloadIssuerRegistry});

    const registryStep = {
      "id": REGISTERED_ISSUER_STEP_ID,
      "valid": !!foundInRegistries.length,
      foundInRegistries,
      registriesNotLoaded
  };

    (verificationResponse.log ??= []).push(registryStep)

}

