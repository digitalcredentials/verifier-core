import chai from 'chai'
import { verifyCredential } from '../src/Verify.js'
import { Credential } from '../src/types/credential.js';
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import { checkSchemas } from '../src/schemaCheck.js';
const { expect } = chai;

/* 
Tests credential *schema* validation.
*/

describe('checkSchemas', () => {
    it.only('passes for array proof', async () => {
        const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
        const vc = JSON.parse(JSON.stringify(originalVC))
        vc.proof = [vc.proof]
        const result = await checkSchemas(vc)
        // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
        console.log(JSON.stringify(result, null, 2))
        expect(result[0].errors).to.not.exist
        expect(result[0].valid).to.be.true
    })

    it.only('fails for object proof', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
        const result = await checkSchemas(vc)
        expect(result[0].errors).to.exist
        expect(result[0].valid).to.be.false
    })

    it.only('returns NO_SCHEMA when no credentialSchema property or context', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-noExpiry-minimal.json')
        const result = await checkSchemas(vc)
        // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
        console.log(JSON.stringify(result, null, 2))
        expect(result).to.deep.equalInAnyOrder({ result: 'NO_SCHEMA' })
    })

    it.only('fails for obv3 based on context with object proof', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const result = await checkSchemas(vc)
        // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
        console.log(JSON.stringify(result, null, 2))
        expect(result[0].errors).to.exist
        expect(result[0].valid).to.be.false
    })

    it.only('passes for obv3 based on context with array proof', async () => {
        const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const vc = JSON.parse(JSON.stringify(originalVC))
        vc.proof = [vc.proof]
        const result = await checkSchemas(vc)
        // const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
        expect(result[0].errors).to.not.exist
        expect(result[0].valid).to.be.true
    })
})

describe('schema results for verification call', () => {
    it.skip('returns positive result', async () => {
        const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const credential = JSON.parse(JSON.stringify(originalVC))
        credential.proof = [credential.proof]
        const result = await verifyCredential({ credential, knownDIDRegistries })
        expect(result).to.exist
        // need to change these to get pull the schema result from the VC result:
        // expect(result[0].errors).to.not.exist
        //  expect(result[0].valid).to.be.true
    })
})


async function fetchVC(url: string): Promise<Credential> {
    const response = await fetch(url);
    const data = await response.json();
    return data as Credential
}