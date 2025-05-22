import chai from 'chai'
import { verifyCredential } from '../src/Verify.js'
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
const { expect } = chai;

/* This file is just here for convenience, as an easy way to try things 
during development, with a few credentials already setup.
*/

const v1oidfNostatusNoexpiryEd25519Signature2020 = {
  "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "urn:uuid:2fe53dc9-b2ec-4939-9b2c-0d00f6663b6c",
  "issuanceDate": "2025-01-09T15:06:31Z",
  "type": [
      "VerifiableCredential",
      "OpenBadgeCredential"
  ],
  "name": "DCC Test Credential",
  "issuer": {
      "type": [
          "Profile"
      ],
      "id": "did:web:digitalcredentials.github.io:vc-test-fixtures:dids:oidf",
      "name": "Digital Credentials Consortium Test Issuer",
      "url": "https://dcconsortium.org",
      "image": "https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png"
  },
  "credentialSubject": {
      "type": [
          "AchievementSubject"
      ],
      "achievement": {
          "id": "urn:uuid:bd6d9316-f7ae-4073-a1e5-2f7f5bd22922",
          "type": [
              "Achievement"
          ],
          "achievementType": "Diploma",
          "name": "Badge",
          "description": "This is a sample credential issued by the Digital Credentials Consortium to demonstrate the functionality of Verifiable Credentials for wallets and verifiers.",
          "criteria": {
              "type": "Criteria",
              "narrative": "This credential was issued to a student that demonstrated proficiency in the Python programming language that occurred from **February 17, 2023** to **June 12, 2023**."
          },
          "image": {
              "id": "https://user-images.githubusercontent.com/752326/214947713-15826a3a-b5ac-4fba-8d4a-884b60cb7157.png",
              "type": "Image"
          }
      },
      "name": "Jane Doe"
  },
  "proof": {
      "type": "Ed25519Signature2020",
      "created": "2025-05-08T16:04:18Z",
      "verificationMethod": "did:web:digitalcredentials.github.io:vc-test-fixtures:dids:oidf#z6MkjXe1vZvPRqFuc9nRBtZ3e1Y9XKDFSbjFAfzLfW2bD6cZ",
      "proofPurpose": "assertionMethod",
      "proofValue": "z3LWc7BqiGRmP2ZnWvXeoVFgmHAcbNsDidMdnP9nnqw5kgNSUzTFVw5nM5dUnzdUTdNHy4SbHYdL9yp6apFVv16oV"
  }
} as any


const didWebCredential = {
  "type": [
    "VerifiableCredential",
    "OpenBadgeCredential"
  ],
  "name": "Teamwork Badge",
  "issuer": {
    "type": [
      "Profile"
    ],
    "name": "Example Corp",
    "id": "did:web:digitalcredentials.github.io:dcc-did-web:issuer-registry-client-test"
  },
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "validFrom": "2010-01-01T00:00:00Z",
  "credentialSubject": {
    "type": [
      "AchievementSubject"
    ],
    "name": "Taylor Tuna",
    "achievement": {
      "id": "https://example.com/achievements/21st-century-skills/teamwork",
      "type": [
        "Achievement"
      ],
      "name": "Masters - v2 - unrevoked",
      "criteria": {
        "narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
      },
      "description": "This badge recognizes the development of the capacity to collaborate within a group environment."
    }
  },
  "id": "urn:uuid:677fe8a6cacf98774d482d07",
  "credentialStatus": {
    "id": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj#9",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListCredential": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj",
    "statusListIndex": "9"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-05-05T18:25:25Z",
    "verificationMethod": "did:web:digitalcredentials.github.io:dcc-did-web:issuer-registry-client-test#z6MkjXe1vZvPRqFuc9nRBtZ3e1Y9XKDFSbjFAfzLfW2bD6cZ",
    "proofPurpose": "assertionMethod",
    "proofValue": "z5iDexxu7spQmDi5yrPYTqHvix3n64YBfwgLhWn9crZFf89wn14opXJZyqFpqmzuTLr8iTLaioxA48bAnH3xbdVoD"
  }
} as any

const didKeyCredential = {
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.2.json",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "urn:uuid:2fe53dc9-b2ec-4939-9b2c-0d00f6663b6c",
  "issuanceDate": "2025-01-09T15:06:31Z",
  "type": [
    "VerifiableCredential",
    "OpenBadgeCredential"
  ],
  "name": "DCC Test Credential",
  "issuer": {
    "type": [
      "Profile"
    ],
    "id": "did:key:z6MkjoriXdbyWD25YXTed114F8hdJrLXQ567xxPHAUKxpKkS",
    "name": "Digital Credentials Consortium Test Issuer",
    "url": "https://dcconsortium.org",
    "image": "https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png"
  },
  "credentialSubject": {
    "type": [
      "AchievementSubject"
    ],
    "achievement": {
      "id": "urn:uuid:bd6d9316-f7ae-4073-a1e5-2f7f5bd22922",
      "type": [
        "Achievement"
      ],
      "achievementType": "Diploma",
      "name": "Badge",
      "description": "This is a sample credential issued by the Digital Credentials Consortium to demonstrate the functionality of Verifiable Credentials for wallets and verifiers.",
      "criteria": {
        "type": "Criteria",
        "narrative": "This credential was issued to a student that demonstrated proficiency in the Python programming language that occurred from **February 17, 2023** to **June 12, 2023**."
      },
      "image": {
        "id": "https://user-images.githubusercontent.com/752326/214947713-15826a3a-b5ac-4fba-8d4a-884b60cb7157.png",
        "type": "Image"
      }
    },
    "name": "Jane Doe"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2025-05-05T19:23:07Z",
    "verificationMethod": "did:key:z6MkjoriXdbyWD25YXTed114F8hdJrLXQ567xxPHAUKxpKkS#z6MkjoriXdbyWD25YXTed114F8hdJrLXQ567xxPHAUKxpKkS",
    "proofPurpose": "assertionMethod",
    "proofValue": "z53hknRoyy5hazo2ZefMQHByRx289xtyJ9zmri2eWJvktNcDfcTMpC8L4aEy8Hyvw4m7Ay3JRRMDsYjSW1AAmKEHV"
  }
} as any


describe('tests to experiment during development work', () => {
  it('tests', async () => {
    // change this however you like to test things, or more likely,
    // change the VC that is passed in.
    const result = await verifyCredential({ credential: didKeyCredential, knownDIDRegistries })
   // console.log(JSON.stringify(result, null, 2))
    expect(result.errors).to.not.exist
  })
})

