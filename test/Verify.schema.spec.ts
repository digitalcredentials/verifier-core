import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyCredential } from '../src/Verify.js'
import { Credential } from '../src/types/credential.js';
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import { checkSchemas } from '../src/schemaCheck.js';
import { SCHEMA_ENTRY_ID } from '../src/constants/verificationSteps.js';
chai.use(deepEqualInAnyOrder);
const { expect } = chai;

/* 
Tests credential *schema* validation.
*/

describe('schemaCheck.checkSchemas', () => {
    it('validates as expected', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
        const result = await checkSchemas(vc)
        expect(result.results[0].result.errors).to.not.exist
        expect(result.results[0].result.valid).to.be.true
    })

    it('fails for missing achievement id', async () => {
        const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-notExpired-withSchema.json')
        const vc = JSON.parse(JSON.stringify(originalVC));
        delete vc.credentialSubject.achievement.id
        const result = await checkSchemas(vc)
        expect(result.results[0].result.errors).to.exist
        expect(result.results[0].result.valid).to.be.false
    })

    it('returns NO_SCHEMA when no credentialSchema property or context', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/legacyRegistry-noStatus-noExpiry-minimal.json')
        const result = await checkSchemas(vc)
        expect(result).to.deep.equalInAnyOrder({ results: 'NO_SCHEMA' })
    })

    it('fails for obv3 based on context with missing achievement id', async () => {
        const originalVC = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const vc = JSON.parse(JSON.stringify(originalVC));
        delete vc.credentialSubject.achievement.id
        const result = await checkSchemas(vc)
        expect(result.results[0].result.errors).to.exist
        expect(result.results[0].result.valid).to.be.false
    })

    it('passes for obv3 guessed by context', async () => {
        const vc = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const result = await checkSchemas(vc)
        expect(result.results[0].result.errors).to.not.exist
        expect(result.results[0].result.valid).to.be.true
    })
})

describe('schema results for verification call', () => {
    it('returns positive result', async () => {
        const credential = await fetchVC('https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/ed25519/didKey/legacy-noStatus-noExpiry.json')
        const result = await verifyCredential({ credential, knownDIDRegistries })
        expect(result.additionalInformation![0].id).to.equal(SCHEMA_ENTRY_ID);
        expect(result.additionalInformation![0].results![0].result.valid).to.be.true
        expect(result.additionalInformation![0].results![0].source).to.equal("Assumed based on vc.type: 'OpenBadgeCredential' and vc version: 'version 2'")
    })

    it('returns error for extra term', async () => {
        const credential = await fetchVC("https://digitalcredentials.github.io/vc-test-fixtures/verifiableCredentials/v2/dataIntegrityProof/didKey/twoOIDF-revoked-notExpired-badSchema.json");
        const result = await verifyCredential({ credential, knownDIDRegistries })
        expect(result.additionalInformation![0].id).to.equal(SCHEMA_ENTRY_ID)
        expect(result.additionalInformation![0].results![0].result.valid).to.be.false
        expect(result.additionalInformation![0].results![0].source).to.equal("Assumed based on vc.type: 'OpenBadgeCredential' and vc version: 'version 2'")
        expect(result.additionalInformation![0].results![0].result.errors![0]).to.deep.equalInAnyOrder({
            "instancePath": "",
            "schemaPath": "#/required",
            "keyword": "required",
            "params": {
                "missingProperty": "validFrom"
            },
            "message": "must have required property 'validFrom'"
        })
    })
})


async function fetchVC(url: string): Promise<Credential> {
    const response = await fetch(url);
    const data = await response.json();
    return data as Credential
}