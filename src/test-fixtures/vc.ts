const signedVC1Unrevoked = {
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
    "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q"
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
      "name": "Masters",
      "criteria": {
        "narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
      },
      "description": "This badge recognizes the development of the capacity to collaborate within a group environment."
    },
    "id": "did:key:z6Mktp8yHRrcEXePJGFhUDsL7X32pwfuuV4TrpaP7dZupdwg"
  },
  "id": "urn:uuid:6740bee6b9c3df2a256e144e",
  "credentialStatus": {
    "id": "https://testing.dcconsortium.org/status/e5WK8CbZ1GjycuPombrj#4",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListCredential": "https://testing.dcconsortium.org/status/e5WK8CbZ1GjycuPombrj",
    "statusListIndex": "4"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2024-11-22T17:28:35Z",
    "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
    "proofPurpose": "assertionMethod",
    "proofValue": "z38x1N8hFFXEQgfomjv1MvP32qqtqzx4sGQAyqqfDGXqLBcw39jKBQvcwWeiVJrqtxZJmu8RZ5DPUrrAc36ejoPyE"
  }
}

const signedVC1 = {
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

const usignedVCv2 = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:uuid:2fe53dc9-b2ec-4939-9b2c-0d00f6663b6c',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  name: 'DCC Test Credential',
  issuer: {
    type: ['Profile'],
    id: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
    name: 'Digital Credentials Consortium Test Issuer',
    url: 'https://dcconsortium.org',
    image:
      'https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png'
  },
  validFrom: '2023-08-02T17:43:32.903Z',
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
  }
}
const unsignedVC = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    'https://w3id.org/vc/status-list/2021/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:uuid:951b475e-b795-43bc-ba8f-a2d01efd2eb1',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
    type: 'Profile',
    name: 'Izzy the Issuer',
    description: 'Issue Issue Issue',
    url: 'https://izzy.iz/',
    image: {
      id: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Blank_2018.png',
      type: 'Image'
    }
  },
  issuanceDate: '2020-01-01T00:00:00Z',
  name: 'Introduction to Digital Credentialing',
  credentialSubject: {
    type: 'AchievementSubject',
    identifier: {
      type: 'IdentityObject',
      identityHash: 'jc.chartrand@gmail.com',
      hashed: 'false'
    },
    achievement: {
      id: 'http://izzy.iz',
      type: 'Achievement',
      criteria: {
        narrative: 'Completion of a credential.'
      },
      description: 'Well done you!',
      name: 'Introduction to Digital Credentialing'
    }
  }
}

// "credentialStatus":
const credentialStatus = {
  id: 'https://digitalcredentials.github.io/credential-status-jc-test/XA5AAK1PV4#16',
  type: 'StatusList2021Entry',
  statusPurpose: 'revocation',
  statusListIndex: 16,
  statusListCredential:
    'https://digitalcredentials.github.io/credential-status-jc-test/XA5AAK1PV4'
}

const credentialStatusBitString = {
  id: 'https://digitalcredentials.github.io/credential-status-jc-test/XA5AAK1PV4#16',
  type: 'BitstringStatusListEntry',
  statusPurpose: 'revocation',
  statusListIndex: 16,
  statusListCredential:
    'https://digitalcredentials.github.io/credential-status-jc-test/XA5AAK1PV4'
}

const getUnsignedVC = (): any => JSON.parse(JSON.stringify(unsignedVC))

const getUnsignedVCv2 = (): any => JSON.parse(JSON.stringify(usignedVCv2))

const getUnsignedVCWithoutSuiteContext = (): any => {
  const vcCopy = JSON.parse(JSON.stringify(unsignedVC))
  const index = vcCopy['@context'].indexOf(ed25519SuiteContext)
  if (index > -1) {
    vcCopy['@context'].splice(index, 1)
  }
  return vcCopy
}
const getCredentialStatus = (): any => JSON.parse(JSON.stringify(credentialStatus))
const getCredentialStatusBitString = (): any =>
  JSON.parse(JSON.stringify(credentialStatusBitString))

const getUnsignedVCWithStatus = (): any => {
  const unsignedVCWithStatus = getUnsignedVC()
  unsignedVCWithStatus.credentialStatus = getCredentialStatus()
  return unsignedVCWithStatus
}

const getUnsignedVC2WithStatus = (): any => {
  const unsignedVC2WithStatus = getUnsignedVCv2()
  unsignedVC2WithStatus.credentialStatus = getCredentialStatusBitString()
  return unsignedVC2WithStatus
}

const ed25519SuiteContext =
  'https://w3id.org/security/suites/ed25519-2020/v1'

const getSignedVC = (): any => {
  return signedVC1
}

const getSignedUnrevokedVC2 = (): any => {
  return signedVC1Unrevoked
}
export {
  getSignedUnrevokedVC2,
  getSignedVC,
  getUnsignedVC,
  getUnsignedVCWithoutSuiteContext,
  getCredentialStatus,
  getCredentialStatusBitString,
  getUnsignedVCWithStatus,
  getUnsignedVC2WithStatus,
  ed25519SuiteContext
}
