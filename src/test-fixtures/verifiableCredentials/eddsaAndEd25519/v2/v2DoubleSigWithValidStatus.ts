export const v2DoubleSigWithValidStatus = {
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
        "id": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj#9",
        "type": "BitstringStatusListEntry",
        "statusPurpose": "revocation",
        "statusListCredential": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj",
        "statusListIndex": "9"
    },
    "proof": [
        {
            "type": "DataIntegrityProof",
            "created": "2025-01-15T16:29:50Z",
            "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
            "cryptosuite": "eddsa-rdfc-2022",
            "proofPurpose": "assertionMethod",
            "proofValue": "z5Hk3nDNYGeuXfSqMTjiFsa2FLWbQn6KfXSioDc6PufxkngVgEQayTWZ5RpbBy9K2FU6tZacsWrQEqB2wgmsVKoUh"
        },
        {
            "type": "Ed25519Signature2020",
            "created": "2025-01-15T16:34:28Z",
            "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
            "proofPurpose": "assertionMethod",
            "proofValue": "zCXYPtKh6M5TEe4YTAk7FNPvLHfP7wrroxkfwECF7GK4GJjS9aRkMYw4Ns9E5PZ8GCZ53MV1bMzhsVuSWTLq885h"
        }
    ]
}