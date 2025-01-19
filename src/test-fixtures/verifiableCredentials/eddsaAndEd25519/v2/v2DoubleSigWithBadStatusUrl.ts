export const v2DoubleSigWithBadStatusUrl = {
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
            "name": "Masters - v2 - unrevoked",
            "criteria": {
                "narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
            },
            "description": "This badge recognizes the development of the capacity to collaborate within a group environment."
        }
    },
    "id": "urn:uuid:677fe8a6cacf98774d482d07",
    "credentialStatus": {
        "id": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5VK8CbZ1GjycuPombrj#9",
        "type": "BitstringStatusListEntry",
        "statusPurpose": "revocation",
        "statusListCredential": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5VK8CbZ1GjycuPombrj",
        "statusListIndex": "9"
    },
    "proof": [
        {
            "type": "Ed25519Signature2020",
            "created": "2025-01-19T20:13:44Z",
            "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
            "proofPurpose": "assertionMethod",
            "proofValue": "z5fqVd2F99EP5yDuUXmGpDvQS7tkz981ZL4qYkHv6ienYmeQy5za5a2qjgZfQWu65DPD9vSxyjgqACt1sHSmEyq9b"
        },
        {
            "type": "DataIntegrityProof",
            "created": "2025-01-19T20:13:44Z",
            "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
            "cryptosuite": "eddsa-rdfc-2022",
            "proofPurpose": "assertionMethod",
            "proofValue": "z4ybSpzWGcrs8HrZ8KdiH2CHAetsq6e926bi8KmEfWPMsWPGbfpZDxgKSaGcCmCwmD92qEpRrpr9bM476BhfbhkDg"
        }
    ]
}