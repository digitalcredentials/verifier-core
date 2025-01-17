import {RegistryClient} from '@digitalcredentials/issuer-registry-client';
import { VerificationResponse } from './types/result.js';
const registries = new RegistryClient()
const registryNotYetLoaded = true;
/**
 * Checks to see if a VC's issuer appears in any of the known DID registries.
 *
 * @returns A list of the names of the DID registries in which the issuer appears.
 */

export async function getTrustedRegistryListForIssuer({ issuer, knownDIDRegistries, reloadIssuerRegistry = false }: {
  issuer: string | any,
  knownDIDRegistries: object,
  reloadIssuerRegistry: boolean | null
}): Promise<string[] | null> {


  // eslint-disable-next-line no-use-before-define
  if (reloadIssuerRegistry || registryNotYetLoaded) {
    const result = await registries.load({ config: knownDIDRegistries })
  }
  const issuerDid = typeof issuer === 'string' ? issuer : issuer.id;
  const issuerInfo = registries.didEntry(issuerDid);
  // See if the issuer DID appears in any of the known registries
  // If yes, assemble a list of registries in which it appears
  return issuerInfo?.inRegistries
    ? Array.from(issuerInfo.inRegistries).map(r => r.name)
    : null;
}

export async function addTrustedIssuersToVerificationResponse( {issuer, knownDIDRegistries, reloadIssuerRegistry = false, verificationResponse} :{
  issuer: string | any,
  reloadIssuerRegistry: boolean | null,
  knownDIDRegistries: object,
  verificationResponse: VerificationResponse
}) : Promise<void>
 {
    const foundInRegistries = await getTrustedRegistryListForIssuer( {issuer, knownDIDRegistries, reloadIssuerRegistry});

    const registryStep = {
      "id": "registered_issuer",
      "valid": !!foundInRegistries,
      ...(foundInRegistries && { foundInRegistries })
  };

    (verificationResponse.log ??= []).push(registryStep)

}

