import { v2NoStatus } from "./verifiableCredentials/v2/v2NoStatus.js"
import { v2Expired } from "./verifiableCredentials/v2/v2Expired.js"
import { v2Revoked } from "./verifiableCredentials/v2/v2Revoked.js"
import { v2WithValidStatus } from "./verifiableCredentials/v2/v2WithValidStatus.js"
import { v2ExpiredWithValidStatus } from "./verifiableCredentials/v2/v2ExpiredWithValidStatus.js"

import { v1WithValidStatus } from "./verifiableCredentials/v1/v1WithValidStatus.js"
import { v1NoStatus } from "./verifiableCredentials/v1/v1NoStatus.js"
import { v1Revoked } from "./verifiableCredentials/v1/v1Revoked.js"
import { v1Expired } from "./verifiableCredentials/v1/v1Expired.js"

const getVCv1 = (): any => {
  return JSON.parse(JSON.stringify(v1NoStatus))
}

const getVCv2 = (): any => {
  return JSON.parse(JSON.stringify(v2NoStatus))
}

const getVCv2NoProof = (): any => {
  // TODO
  }

const getVCv1NoProof = (): any => {
  const v1 = getVCv1()
  delete v1.proof
  return v1}



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

const getVCv2Tampered = (): any => {
  const cred = getVCv2()
  cred.name = 'tampered!'
  return cred
}

export {
  getVCv2Expired,
  getVCv2Revoked,
  getVCv2Tampered,
  getVCv2ValidStatus,
  getVCv2ExpiredAndTampered,
  getVCv2NoProof,
  getVCv2,

  getVCv1Expired,
  getVCv1Revoked,
  getVCv1Tampered,
  getVCv1ValidStatus,
  getVCv1,
  getVCv1NoProof
}
