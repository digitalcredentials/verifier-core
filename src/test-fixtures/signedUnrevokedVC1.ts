export const signedUnrevokedVC1 = {
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
  