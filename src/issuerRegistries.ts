import {RegistryClient} from '@digitalcredentials/issuer-registry-client';
import {knownDidRegistries} from '../.knownDidRegistries'
import { VerificationResponse } from './types/result';
const registries = new RegistryClient()
const registryNotYetLoaded = true;
/**
 * Checks to see if a VC's issuer appears in any of the known DID registries.
 *
 * @returns A list of the names of the DID registries in which the issuer appears.
 */

export async function getTrustedRegistryListForIssuer({ issuer, reloadIssuerRegistry = false }: {
  issuer: string | any,
  reloadIssuerRegistry: boolean | null
}): Promise<string[] | null> {

  if (reloadIssuerRegistry ?? registryNotYetLoaded) {
    await registries.load({ config: knownDidRegistries })
  }
  const issuerDid = typeof issuer === 'string' ? issuer : issuer.id;
  const issuerInfo = registries.didEntry(issuerDid);
  // See if the issuer DID appears in any of the known registries
  // If yes, assemble a list of registries in which it appears
  return issuerInfo?.inRegistries
    ? Array.from(issuerInfo.inRegistries).map(r => r.name)
    : null;
}

export async function addTrustedIssuersToVerificationResponse( {issuer, reloadIssuerRegistry = false, verificationResponse} :{
  issuer: string | any,
  reloadIssuerRegistry: boolean | null
  verificationResponse: VerificationResponse
}) : Promise<void>
 {
    const foundInRegistries = await getTrustedRegistryListForIssuer( {issuer, reloadIssuerRegistry});

    const registryStep = {
      "id": "registered_issuer",
      "valid": !!foundInRegistries,
      ...(foundInRegistries && { foundInRegistries })
  };

    (verificationResponse.log ??= []).push(registryStep)

}

