export const v1RevokedAndExpired = {
    "type": [
        "VerifiableCredential",
        "OpenBadgeCredential"
    ],
    "name": "Sam Salmon - Mock Bachelor of Science Degree in Computer Science",
    "issuer": {
        "url": "https://web.mit.edu/",
        "type": "Profile",
        "name": "Massachusetts Institute of Technology",
        "image": {
            "id": "https://github.com/digitalcredentials/test-files/assets/206059/01eca9f5-a508-40ac-9dd5-c12d11308894",
            "type": "Image"
        },
        "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q"
    },
    "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.1.json",
        "https://www.w3.org/ns/credentials/status/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "credentialSubject": {
        "type": [
            "AchievementSubject"
        ],
        "name": "Sam Salmon",
        "achievement": {
            "id": "urn:uuid:951b475e-b795-43bc-ba8f-a2d01efd2eb1",
            "type": [
                "Achievement"
            ],
            "name": "Mock Bachelor of Science in Computer Science",
            "criteria": {
                "type": "Criteria",
                "narrative": "In Recognition of proficiency in the general and the special studies and exercises prescribed by said institution for such mock degree given this day under the seal of the Institute at Cambridge in the Commonwealth of Massachusetts"
            },
            "description": "Massachusetts Institute of Technology Mock Bachelor of Science in Computer Science",
            "fieldOfStudy": "Computer Science",
            "achievementType": "BachelorDegree"
        }
    },
    "id": "urn:uuid:677fe54fcacf98774d482bcb",
    "credentialStatus": {
        "id": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj#6",
        "type": "BitstringStatusListEntry",
        "statusPurpose": "revocation",
        "statusListCredential": "https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj",
        "statusListIndex": "6"
    },
    "issuanceDate": "2025-01-09T15:06:31Z",
    "expirationDate": "2025-01-09T16:23:24Z",
    "proof": {
        "type": "Ed25519Signature2020",
        "created": "2025-01-09T17:53:13Z",
        "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
        "proofPurpose": "assertionMethod",
        "proofValue": "zCFwdjxMQpWfVtdz85WC2i44qBjHZfJ4GzZ4weHtk48VN7E292P7X1NL7EXwtuEfax8wFPjh3cdhCVAedHNb2uZM"
    }
}