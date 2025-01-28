# verifier-core _(@digitalcredentials/verifier-core)_

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/verifier-core/main.yml?branch=jc-implement)](https://github.com/digitalcredentials/verifier-core/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@digitalcredentials/verifier-core.svg)](https://npm.im/@digitalcredentials/verifier-core)
[![Coverage Status](https://coveralls.io/repos/github/digitalcredentials/verifier-core/badge.svg?branch=jc-implement)](https://coveralls.io/github/digitalcredentials/verifier-core?branch=jc-implement)

> Verifies W3C Verifiable Credentials in the browser, Node.js, and React Native.

## Table of Contents
- [Overview](#overview)
- [API](#api)
- [Install](#install)
- [Contribute](#contribute)
- [License](#license)

## Overview

Verifies the following versions of W3C Verifiable Credentials:

* [1.0](https://www.w3.org/TR/2019/REC-vc-data-model-20191119/)
* [1.1](https://www.w3.org/TR/2022/REC-vc-data-model-20220303/)
* [2.0](https://www.w3.org/TR/vc-data-model-2.0/)

And verifies signatures from both [eddsa-rdfc-2022 Data Integrity Proof](https://github.com/digitalbazaar/eddsa-rdfc-2022-cryptosuite) and [ed25519-signature-2020 Linked Data Proof](https://github.com/digitalbazaar/ed25519-signature-2020) cryptosuites.

The verification checks that the credential:

* has a valid signature (i.e, that the credential hasn't been tampered with)
* hasn't expired
* hasn't been revoked
* was signed by a trusted issuer

As of January 2025 issuers are trusted if they are listed in one of the Digital Credentials Issuer Registries:

```
{
    name: 'DCC Pilot Registry',
    url: 'https://digitalcredentials.github.io/issuer-registry/registry.json'
  },
  {
    name: 'DCC Sandbox Registry',
    url: 'https://digitalcredentials.github.io/sandbox-registry/registry.json'
  },
  {
    name: 'DCC Community Registry',
    url: 'https://digitalcredentials.github.io/community-registry/registry.json'
  },
  {
    name: 'DCC Registry',
    url: 'https://digitalcredentials.github.io/dcc-registry/registry.json'
  }
  ```

  The DCC is working on a new trust registry model that will extend the registry scope.

## API

This package exports two methods:

* verifyCredential
* verifyPresentation

### verifyCredential

```verifyCredential({credential, reloadIssuerRegistry = true})```

#### arguments

* credential - The W3C Verifiable Credential to be verified.
* knownDidRegistries - a list of trusted registries.
* reloadIssuerRegistry - A boolean (true/false) indication whether or not to refresh the cached copy of the registries.

#### result

The typescript definitions for the result can be found [here](./src/types/result.ts)

Note that the verification result doesn't make any conclusion about the overall validity of a credential. It only checks the validity of each of the four steps, leaving it up to the consumer of the result to decide on the overall validity. The consumer might not, for example, consider a credential that had expired or had been revoked to be 'invalid'. The credential might still in fact be useful as a record of history, i.e, I had a driver's licence that expired two years ago, but did have it during the period 2018 to 2023, and that information might be useful.

There are three general flavours of result that might be returned:

1. <b>all checks were conclusive</b>

All of the checks were run *conclusively*, meaning that we determined whether each of the four steps in verification (signature, expiry, revocation, known issuer) was true or false.

A conclusive verification might look like this example where all steps returned valid=true:

```
{
  "isFatal": false,
  "credential": {the supplied vc - left out here for brevity/clarity},
  "log": [
    {
      "id": "valid_signature",
      "valid": true
    },
    {
      "id": "expiration",
      "valid": true
    },
    {
      "id": "revocation_status",
      "valid": true
    },
    {
      "id": "registered_issuer",
      "valid": true,
      "foundInRegistries": [
        "DCC Sandbox Registry"
      ],
      "registriesNotLoaded":[]
    }
  ]
}
```

Note that an invalid signature is considered fatal because it means that the revocation status, expiry data, or issuer id may have been tampered with, and so we can't say anything conclusive about any of them.

Here is what the verification result for an expired credential might look like, where we have made conclusive determinations about each step, and all are true except for the expiry:

```
{
  "isFatal": false,
  "credential": {the supplied vc - left out here for brevity/clarity},
  "log": [
    {
      "id": "valid_signature",
      "valid": true
    },
    {
      "id": "expiration",
      "valid": false
    },
      "id": "revocation_status",
      "valid": true
    },
    {
      "id": "registered_issuer",
      "valid": true,
      "foundInRegistries": [
        "DCC Sandbox Registry"
      ],
      "registriesNotLoaded":[]
    }
  ]
}
```

2. <b> partially successful verification</b>

A verification might partly succeed if it can verify:

* the signature
* the expiry date

But can't retrieve (from the network) any one of the:

* revocation status
* the issuer registry
* the issuer's DID document 

which are needed to verify the revocation status and issuer identity.

For steps that we can't conclusively verify one way or the other (true or false) we return an 'error' propery rather than a 'valid' property.

A partially successful verification might look like this example:

```
{
  "isFatal": false,
  "credential": {the supplied vc - left out here for brevity/clarity},
  "log": [
    {
      "id": "valid_signature",
      "valid": true
    },
    {
      "id": "expiration",
      "valid": true
    },
    {
      "id": "revocation_status",
      "error": {
            "name": "network-error",
            "message": "Could not retrieve the revocation status list."
      }   
    },
    {
      "id": "registered_issuer",
      "valid": false,
      "foundInRegistries": [],
      "registriesNotLoaded": [
        {
          "name": "DCC Sandbox Registry",
          "url": "https://onlynoyrt.com/registry.json"
        }
      ]
    }
  ]
}
```

3. <b>fatal error</b>

Fatal errors are errors that prevent us from saying anything conclusive about the credential, and so we don't list the results of each step (the 'log') because we can't decisively say if any are true or false. Reverting to saying they are all false would be misleading, because that could be interepreted to mean that the credential was, for example, revoked when really we just don't know one way or the other.

Examples of fatal errors:

<b>invalid signature</b>
  
Fatal because if the signature is invalid it means any part of the credential could have been tampered with, including the revocation status, expiration, and issuer identity.

```
{
  "credential": {vc removed for brevity/clarity in this example},
  "isFatal": true,
  "errors": [
    {
      "name": "invalid_signature",
      "message": "The signature is not valid."
    }
  ]
}
```

<b>unresolvable did</b>

Fatal because we couldn't retrieve the DID document containing the public signing key with which to check the signature. This error is most likely to happen with a did:web if the url for the did:web document is wrong or
has been taken down, or there is a network error.

```
{
  "credential": {vc removed for brevity/clarity},
  "isFatal": true,
  "errors": [
    {
      "name": "did_web_unresolved",
      "message": "The signature could not be checked because the public signing key could not be retrieved from https://digitalcredentials.github.io/dcc-did-web-bad/did.json"
    }
  ]
}
```

<b>malformed credential</b>
  
The supplied credential may not conform to the VerifiableCredential or LinkedData specifications(possibly because it follows some older convention, or maybe hasn't yet been signed) and might not even be a Verifiable Credential at all.

Some specific examples:

<b><i>invalid_jsonld</i></b>

There is no @context property at the top level of the credential:

```
{
  "credential": {
    "id": "http://example.com/credentials/3527",
    "type": [
      "VerifiableCredential",
      "OpenBadgeCredential"
    ],
    "issuer": {
      "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "type": [
        "Profile"
      ],
      "name": "Example Corp"
    },
    "validFrom": "2010-01-01T00:00:00Z",
    "name": "Teamwork Badge",
    "credentialSubject": {
      "id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
      "type": [
        "AchievementSubject"
      ],
      "achievement": {
        "id": "https://example.com/achievements/21st-century-skills/teamwork",
        "type": [
          "Achievement"
        ],
        "criteria": {
          "narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
        },
        "description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
        "name": "Teamwork"
      }
    },
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2025-01-09T17:58:33Z",
      "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "proofPurpose": "assertionMethod",
      "proofValue": "z62t6TYCERpTKuWCRhHc2fV7JoMhiFuEcCXGkX9iit8atQPhviN5cZeZfXRnvJWa3Bm6DjagKyrauaSJfp9C9i7q3"
    }
  },
  "isFatal": true,
  "errors": [
    {
      "name": "invalid_jsonld",
      "message": "The credential does not appear to be a valid jsonld document - there is no context."
    }
  ]
}
```

<b><i>no_vc_context</i></b>

Although this is a linked data document, with an @context property, the Verifiable Credential context (i.e, "https://www.w3.org/2018/credentials/v1") is missing:

```
{
  "credential": {
    "@context": [
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": "http://example.com/credentials/3527",
    "type": [
      "VerifiableCredential",
      "OpenBadgeCredential"
    ],
    "issuer": {
      "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "type": [
        "Profile"
      ],
      "name": "Example Corp"
    },
    "validFrom": "2010-01-01T00:00:00Z",
    "name": "Teamwork Badge",
    "credentialSubject": {
      "id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
      "type": [
        "AchievementSubject"
      ],
      "achievement": {
        "id": "https://example.com/achievements/21st-century-skills/teamwork",
        "type": [
          "Achievement"
        ],
        "criteria": {
          "narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
        },
        "description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
        "name": "Teamwork"
      }
    },
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2025-01-09T17:58:33Z",
      "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "proofPurpose": "assertionMethod",
      "proofValue": "z62t6TYCERpTKuWCRhHc2fV7JoMhiFuEcCXGkX9iit8atQPhviN5cZeZfXRnvJWa3Bm6DjagKyrauaSJfp9C9i7q3"
    }
  },
  "isFatal": true,
  "errors": [
    {
      "name": "no_vc_context",
      "message": "The credential doesn't have a verifiable credential context."
    }
  ]
}
```

<b><i>invalid_credential_id</i></b>

In this example, the top level id property on the credential is not a uri, but should be:

```
{
  "credential": {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.2.json",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": "0923lksjf",
    "type": [
      "VerifiableCredential",
      "OpenBadgeCredential"
    ],
    "name": "DCC Test Credential",
    "issuer": {
      "type": [
        "Profile"
      ],
      "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "name": "Digital Credentials Consortium Test Issuer",
      "url": "https://dcconsortium.org",
      "image": "https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png"
    },
    "issuanceDate": "2023-08-02T17:43:32.903Z",
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
      "created": "2023-10-05T11:17:41Z",
      "verificationMethod": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "proofPurpose": "assertionMethod",
      "proofValue": "z5fk6gq9upyZvcFvJdRdeL5KmvHr69jxEkyDEd2HyQdyhk9VnDEonNSmrfLAcLEDT9j4gGdCG24WHhojVHPbRsNER"
    }
  },
  "isFatal": true,
  "errors": [
    {
      "name": "invalid_credential_id",
      "message": "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement."
    }
  ]
}
```

<b><i>no_proof</i></b>

The proof property is missing, likely because the credential hasn't been signed:

```
{
  "credential": {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.2.json",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": "urn:uuid:2fe53dc9-b2ec-4939-9b2c-0d00f6663b6c",
    "type": [
      "VerifiableCredential",
      "OpenBadgeCredential"
    ],
    "name": "DCC Test Credential",
    "issuer": {
      "type": [
        "Profile"
      ],
      "id": "did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q",
      "name": "Digital Credentials Consortium Test Issuer",
      "url": "https://dcconsortium.org",
      "image": "https://user-images.githubusercontent.com/752326/230469660-8f80d264-eccf-4edd-8e50-ea634d407778.png"
    },
    "issuanceDate": "2023-08-02T17:43:32.903Z",
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
    }
  },
  "isFatal": true,
  "errors": [
    {
      "name": "no_proof",
      "message": "This is not a Verifiable Credential - it does not have a digital signature."
    }
  ]
}
```


<b>software problem</b>
  
A software error might prevent verification


### verifyPresentation

```verifyPresentation({presentation, reloadIssuerRegistry = true})```

A Verifiable Presentation (VP) is a wrapper around zero or more Verifiable Credentials. A VP is also cryptographically signed, like a VC, but whereas a VC is signed by the issuer of the credentials, the VP is signed by the holder of the credentials, typically to demonstrate 'control' of the contained credentials. The VP is signed with a DID that the holder owns, and ofthen that DID is recorded inside the Verifiable Credentials as the 'owner' or 'holder' of the credential. So by signing the VP with the private key corresponding to the DID we can prove we 'own' the credentials.

A VP is also sometimes used without any containted VC simply to prove that we control a given DID, say for authentication, or often for the case where when an issuer is issuing a credential to a DID, the issuer wants to know that the recipient in fact does control that DID.

Verifying a VP amounts to verifying the signature on the VP and that the VP hasn't expired, and also verifying all of the contained VCs, one by one.

#### arguments

* presentation - The W3C Verifiable Presentation to be verified.
* reloadIssuerRegistry - Whether or not to refresh the cached copy of the registry.

#### result

With a VP we have a result for the vp as well as for all the contained VCs.

## Install

- Node.js 18+ is recommended.

### NPM

To install via NPM:

```
npm install @digitalcredentials/verifier-core
```

### Development

To install locally (for development):

```
git clone https://github.com/digitalcredentials/verifier-core.git
cd verifier-core
npm install
```

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2025 Digital Credentials Consortium.
