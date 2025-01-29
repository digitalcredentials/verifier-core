import { v2NoStatus } from "./verifiableCredentials/v2/v2NoStatus.js"
import { v2Expired } from "./verifiableCredentials/v2/v2Expired.js"
import { v2Revoked } from "./verifiableCredentials/v2/v2Revoked.js"
import { v2WithValidStatus } from "./verifiableCredentials/v2/v2WithValidStatus.js"
import { v2ExpiredWithValidStatus } from "./verifiableCredentials/v2/v2ExpiredWithValidStatus.js"

import { v1WithValidStatus } from "./verifiableCredentials/v1/v1WithValidStatus.js"
import { v1NoStatus } from "./verifiableCredentials/v1/v1NoStatus.js"
import { v1Revoked } from "./verifiableCredentials/v1/v1Revoked.js"
import { v1Expired } from "./verifiableCredentials/v1/v1Expired.js"
import { v1ExpiredWithValidStatus } from "./verifiableCredentials/v1/v1ExpiredWithValidStatus.js"
import { v2SimpleIssuerId } from "./verifiableCredentials/v2/v2SimpleIssuerId.js"
import { v2EddsaWithValidStatus } from "./verifiableCredentials/eddsa/v2/v2EddsaWithValidStatus.js"
import { v2DoubleSigWithBadStatusUrl } from "./verifiableCredentials/eddsaAndEd25519/v2/v2DoubleSigWithBadStatusUrl.js"

import { v2didWebWithValidStatus } from "./verifiableCredentials/v2/didWeb/v2didWebWithValidStatus.js"
import { v2WithBadDidWeb } from "./verifiableCredentials/v2/didWeb/v2WithBadDidWeb.js"
import { v1SimpleIssuerId } from "./verifiableCredentials/v1/v1SimpleIssuerId.js"

const getVCv1 = (): any => {
  return JSON.parse(JSON.stringify(v1NoStatus))
}

const getVCv2 = (): any => {
  return JSON.parse(JSON.stringify(v2NoStatus))
}

const getVCv2NoProof = (): any => {
  const v2 = getVCv2()
  delete v2.proof
  return v2
  }

const getVCv1NoProof = (): any => {
  const v1 = getVCv1()
  delete v1.proof
  return v1
}



const getVCv1ValidStatus = (): any => {
  return v1WithValidStatus
}
const getVCv2ValidStatus = (): any => {
  return v2WithValidStatus
}

const getVCv1Tampered = (): any => {
  const signedVC1 = getVCv1()
  signedVC1.name = 'Introduction to Tampering'
  return signedVC1
}

const getVCv1Expired = (): any => {
  return JSON.parse(JSON.stringify(v1Expired))
}
const getVCv2Expired = (): any => {
  return JSON.parse(JSON.stringify(v2Expired))
}
const getVCv2Revoked = (): any => {
  return JSON.parse(JSON.stringify(v2Revoked))
}
const getVCv1Revoked = (): any => {
  return JSON.parse(JSON.stringify(v1Revoked))
}

const getVCv2ExpiredAndTampered = (): any => {
  const cred = getVCv2Expired()
  cred.name = 'tampered!'
  return cred
}
const getVCv1ExpiredAndTampered = (): any => {
  const cred = getVCv1Expired()
  cred.name = 'tampered!'
  return cred
}
const getVCv2Tampered = (): any => {
  const cred = getVCv2()
  cred.name = 'tampered!'
  return cred
}

const getCredentialWithoutContext = (): any => {
  const cred = getVCv2()
  delete cred['@context']
  return cred
}

const getCredentialWithoutVCContext = (): any => {
  const cred = getVCv2()  
  cred['@context'] = cred['@context'].filter((context : string) => context !== 'https://www.w3.org/ns/credentials/v2')   // remove the vc context
  return cred
}

const getVCv2NonURIId = (): any => {
  const cred = getVCv2()
  cred.id = "0923lksjf"
  return cred
}

const getVCv1NonURIId = (): any => {
  const cred = getVCv1()
  cred.id = "0923lksjf"
  return cred
}

const getVCv1ExpiredWithValidStatus = (): any => {
  return JSON.parse(JSON.stringify(v1ExpiredWithValidStatus))
}

const getVCv2ExpiredWithValidStatus = (): any => {
  return JSON.parse(JSON.stringify(v2ExpiredWithValidStatus))
}

const getVCv2EddsaWithValidStatus = (): any => {
  return JSON.parse(JSON.stringify(v2EddsaWithValidStatus))
}

const getVCv2DoubleSigWithBadStatusUrl = (): any => {
  return JSON.parse(JSON.stringify(v2DoubleSigWithBadStatusUrl))
}

const getVCv2DidWebWithValidStatus = (): any => {
  return JSON.parse(JSON.stringify(v2didWebWithValidStatus))
}

const getVCv2WithBadDidWebUrl = (): any => {
  return JSON.parse(JSON.stringify(v2WithBadDidWeb))
}

const getVCv1SimpleIssuerId = (): any => {
  return JSON.parse(JSON.stringify(v1SimpleIssuerId))
}

const getVCv2SimpleIssuerId = (): any => {
  return JSON.parse(JSON.stringify(v2SimpleIssuerId))
}

export {

  getCredentialWithoutContext,
  getCredentialWithoutVCContext,

  getVCv2EddsaWithValidStatus,
  getVCv2DoubleSigWithBadStatusUrl,

  getVCv2,
  getVCv2SimpleIssuerId,
  getVCv2Expired,
  getVCv2Revoked,
  getVCv2Tampered,
  getVCv2ValidStatus,
  getVCv2ExpiredAndTampered,
  getVCv2ExpiredWithValidStatus,
  getVCv2NoProof,
  getVCv2NonURIId,
  getVCv2DidWebWithValidStatus,
  getVCv2WithBadDidWebUrl,

  getVCv1,
  getVCv1SimpleIssuerId,
  getVCv1Expired,
  getVCv1Revoked,
  getVCv1Tampered,
  getVCv1ValidStatus,
  getVCv1ExpiredAndTampered,
  getVCv1ExpiredWithValidStatus,
  getVCv1NoProof,
  getVCv1NonURIId
}
