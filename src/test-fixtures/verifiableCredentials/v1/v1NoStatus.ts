export const v1NoStatus = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.2.json',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: 'urn:uuid:2fe53dc9-b2ec-4939-9b2c-0d00f6663b6c',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: 'DCC Test Credential',
    issuer: {
      type: ['Profile'],
      id: 'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q',
      name: 'Digital Credentials Consortium Test Issuer',
      url: 'https://dcconsortium.org',
      image:
        'https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png'
    },
    issuanceDate: '2023-08-02T17:43:32.903Z',
    credentialSubject: {
      type: ['AchievementSubject'],
      achievement: {
        id: 'urn:uuid:bd6d9316-f7ae-4073-a1e5-2f7f5bd22922',
        type: ['Achievement'],
        achievementType: 'Diploma',
        name: 'Badge',
        description:
          'This is a sample credential issued by the Digital Credentials Consortium to demonstrate the functionality of Verifiable Credentials for wallets and verifiers.',
        criteria: {
          type: 'Criteria',
          narrative:
            'This credential was issued to a student that demonstrated proficiency in the Python programming language that occurred from **February 17, 2023** to **June 12, 2023**.'
        },
        image: {
          id: 'https://user-images.githubusercontent.com/752326/214947713-15826a3a-b5ac-4fba-8d4a-884b60cb7157.png',
          type: 'Image'
        }
      },
      name: 'Jane Doe'
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: '2023-10-05T11:17:41Z',
      verificationMethod:
        'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q',
      proofPurpose: 'assertionMethod',
      proofValue:
        'z5fk6gq9upyZvcFvJdRdeL5KmvHr69jxEkyDEd2HyQdyhk9VnDEonNSmrfLAcLEDT9j4gGdCG24WHhojVHPbRsNER'
    }
  }
