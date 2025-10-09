import chai from 'chai'
import { verifyCredential } from '../src/Verify.js'
import { Credential } from '../src/types/credential.js';
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import { checkSchemas } from '../src/schemaCheck.js';
const { expect } = chai;

/* 
Tests credential *schema* validation.
*/

describe('obv3 schema check when no credentialSchema property', () => {
  it.skip('tests', async () => {
    const vc = await fetchVC('NEED A PLAIN VC HERE, I.E, NO OBV3')
    const result = await checkSchemas(vc)
    // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
    console.log(JSON.stringify(result, null, 2))
    expect(result).to.equal({result: 'NO_SCHEMA'})
  })
})

describe('failing schema check for obv3 when no credentialSchema', () => {
  it.only('tests', async () => {
    const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
    const result = await checkSchemas(vc)
    // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
    console.log(JSON.stringify(result, null, 2))
    expect(result[0].errors).to.exist
    expect(result[0].valid).to.be.false
  })
})

describe('schema check to fail for object proof', () => {
  it.only('tests', async () => {
    // change this however you like to test things
    const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
    const result = await checkSchemas(vc)
    // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
    console.log(JSON.stringify(result, null, 2))
    expect(result[0].errors).to.exist
    expect(result[0].valid).to.be.false
  })
})

describe('schema check to pass for array proof', () => {
  it.only('tests', async () => {
    // change this however you like to test things
    const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
    const vc = JSON.parse(JSON.stringify(originalVC))
    vc.proof = [vc.proof]
    const result = await checkSchemas(vc)
    // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
    console.log(JSON.stringify(result, null, 2))
    expect(result[0].errors).to.not.exist
    expect(result[0].valid).to.be.true
  })
})


async function fetchVC(url:string) : Promise<Credential> {
    const response = await fetch(url);
    const data = await response.json();
    return data as Credential
}