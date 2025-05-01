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

* has a valid signature, and so therefore:
  * the credential hasn't been tampered with
  * the public signing key was successfully retrieved from the did document
* hasn't expired
* hasn't been revoked
* was signed by a trusted issuer

The verification will also tell us if any of the registries listed in the trusted registry list couldn't be loaded (say because of a network error), which is important because those missing registries might be the very registries that affirm the trustworthiness of the issuer of a given credential.

As of May 2025 we've published a list of known DCC registries:

```
https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json
  ```

 that you would retrieve something like so:

```
const response = await fetch("https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json");
const knownRegistries = await response.json();
  ```

and then pass that knownRegistries variable into the call to verifyCredential, as explained below.

## API

This package exports two methods:

* verifyCredential
* verifyPresentation

### verifyCredential

```verifyCredential({credential, knownDidRegistries, reloadIssuerRegistry = true})```

#### arguments

* credential - The W3C Verifiable Credential to be verified.
* knownDidRegistries - a list of trusted registries.


#### result

The typescript definitions for the result can be found [here](./src/types/result.ts)

Note that the verification result doesn't make any conclusion about the overall validity of a credential. It only checks the validity of each of the four steps, leaving it up to the consumer of the result to decide on the overall validity. The consumer might not, for example, consider a credential that had expired or had been revoked to be 'invalid'. The credential might still in fact be useful as a record of history, i.e, I had a driver's licence that expired two years ago, but it was valid during the period 2018 to 2023, and that information might be useful.

Four steps are checked, returning a result per step in a log like so:


```
{
  "credential": {the VC that was submitted is returned here},
  "log": [
    {
      "id": "valid_signature",
      "valid": true (if it is false then an error is returned instead of the log)
    },
    {
      "id": "expiration",
      "valid": true/false
    },
    {
      "id": "revocation_status",
      "valid": true/false
    },
    {
      "id": "registered_issuer",
      "valid": true/false,
      "matchingIssuers": [
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "DCC test issuer",
              "homepage_uri": "https://digitalcredentials.mit.edu",
              "location": "Cambridge, MA, USA"
            }
          },
          "registry": {
            "name": "DCC Sandbox Registry",
            "type": "dcc-legacy",
            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
          }
        },
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "OneUni University",
              "homepage_uri": "https://oneuni.edu",
              "logo_uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAB4SURBVEhLY1Da6ENTNGoBQTRqAUE0Yixwkq3X5tNgAANBkRlosvgQERbM0OaAmAwFNLFAkMNdW2KGkwjIE1S3AIFGLSCIRi0giEYtwIHq5Tk0BCEIaDwIwLh89RiKMRBRFkDNxQBUsoAyNGoBQTRqAUE01C3Y6AMAsDxJowXOs6oAAAAASUVORK5CYII="
            },
            "institution_additional_information": {
              "legal_name": "Board and Trustees of OneUni University"
            },
            "credential_registry_entity": {
              "ctid": "ce-e8a41a52-6ff6-48f0-9872-889c87b093b7",
              "ce_url": "https://credentialengineregistry.org/resources/ce-e8a41a52-6ff6-48f0-9872-889c87b093b7"
            },
            "ror_entity": {
              "rorid": "042nb2s44",
              "ror_url": "https://ror.org/042nb2s44"
            }
          },
          "registry": {
            "type": "oidf",
            "fetchEndpoint": "https://test.registry.dcconsortium.org/fetch?sub=",
            "name": "DCC Member Registry"
          }
        }
      ],
      "uncheckedRegistries": [
            {
             "name": "DCC Community Registry",
             "type": "dcc-legacy",
             "url": "https://onldynoyrrrt.com/registry.json"
           },
           {
              "name": "DCC Pilot Registry",
              "type": "dcc-legacy",
              "url": "https://onldynoyrt.com/registry.json"
            }
      ]
    }
  ]
}
```

Variations and errors are covered next...

There are three general flavours of result that might be returned:

1. <b>all checks were conclusive</b>

All of the checks were run *conclusively*, meaning that we determined whether each of the four steps in verification (signature, expiry, revocation, known issuer) was true or false.

A conclusive verification might look like this example where all steps returned valid=true:

```
{
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
      "matchingIssuers": [
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "DCC did:web test",
              "homepage_uri": "https://digitalcredentials.mit.edu",
              "location": "Cambridge, MA, USA"
            }
          },
          "registry": {
            "name": "DCC Sandbox Registry",
            "type": "dcc-legacy",
            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
          }
        }
      ],
      "uncheckedRegistries": []
    }
  ]
}
```

Note that an invalid signature is considered fatal because it means that the revocation status, expiry data, or issuer id may have been tampered with, and so we can't say anything conclusive about any of them.

And here is a slightly different verification result where we have still made conclusive determinations about each step, and all are true except for the expiry:

```
{
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
      "matchingIssuers": [
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "DCC did:web test",
              "homepage_uri": "https://digitalcredentials.mit.edu",
              "location": "Cambridge, MA, USA"
            }
          },
          "registry": {
            "name": "DCC Sandbox Registry",
            "type": "dcc-legacy",
            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
          }
        }
      ],
      "uncheckedRegistries": []
    }
  ]
}
```

2. <b> partially successful verification</b>

A verification might partly succeed if it can verify:

* the signature
* the expiry date

But can't retrieve (from the network) any one of:

* the revocation status
* an issuer registry from our list of trusted issuers
* the issuer's DID document 

which are needed to verify the revocation status and issuer identity.

For the valid_signature and revocation_status steps, if we can't conclusively verify one way or the other (true or false) we return an 'error' propery rather than a 'valid' property.

For the registered_issuer step we always return false if the issuer isn't found in a loaded registry, but with the caveat that if the 'registriesNotLoaded' property does contain one or more registries, then the credential *might* have been in one of those registries. It is up to the consumer of the result to decide how to deal with that.

A partially successful verification might look like this example, where we couldn't retrieve the status list or one of the registries:

```
{
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
            "name": "'status_list_not_found'",
            "message": "Could not retrieve the revocation status list."
      }   
    },
    {
      "id": "registered_issuer",
      "valid": false,
      "matchingIssuers": [
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "DCC did:web test",
              "homepage_uri": "https://digitalcredentials.mit.edu",
              "location": "Cambridge, MA, USA"
            }
          },
          "registry": {
            "name": "DCC Sandbox Registry",
            "type": "dcc-legacy",
            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
          }
        }
      ],
      "uncheckedRegistries": [
            {
             "name": "DCC Community Registry",
             "type": "dcc-legacy",
             "url": "https://onldynoyrrrt.com/registry.json"
           },
           {
              "name": "DCC Pilot Registry",
              "type": "dcc-legacy",
              "url": "https://onldynoyrt.com/registry.json"
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
  
Fatal because if the signature is invalid it means any part of the credential could have been tampered with, including the revocation status, expiration, and issuer identity. In these cases we don't return a 'valid' property, but instead an 'errors' property

```
{
  "credential": {vc removed for brevity/clarity in this example},
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
  "errors": [
    {
      "name": "did_web_unresolved",
      "message": "The signature could not be checked because the public signing key could not be retrieved from https://digitalcredentials.github.io/dcc-did-web-bad/did.json"
    }
  ]
}
```

<b>unknown http error</b>

A catchall error for unknown http errors when verifying the signature.

```
{
  "credential": {vc removed for brevity/clarity},
  "errors": [
    {
      "name": "http_error_with_signature_check",
      "message": "An http error prevented the signature check."
    }
  ]
}
```



<b>malformed credential</b>
  
The supplied credential may not conform to the VerifiableCredential or LinkedData specifications(possibly because it follows some older convention, or maybe hasn't yet been signed) and might not even be a Verifiable Credential at all.

Specific cases:

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
  "errors": [
    {
      "name": "no_proof",
      "message": "This is not a Verifiable Credential - it does not have a digital signature."
    }
  ]
}
```


<b>other problem</b>
  
Some other error might also prevent verification, and an error, possibly with a stack trace, might be returned:

```
{
  "errors": [
    {
      "name": "unknown_error",
      "message": "Some kind of error - this message will depend on the error",
      "stackTrace": "some kind of stack trace"
    }
  ]
}
```


### verifyPresentation

```verifyPresentation({presentation, reloadIssuerRegistry = true, unsignedPresentation = false})```

A Verifiable Presentation (VP) is a wrapper around zero or more Verifiable Credentials. A VP can be cryptographically signed, like a VC, but whereas a VC is signed by the issuer of the credentials, the VP is signed by the holder of the credentials contained in the VP, typically to demonstrate 'control' of the contained credentials. The VP is signed with a DID that the holder owns, and usually that DID was recorded inside the Verifiable Credentials - at the time of issuance - as the 'owner' or 'holder' of the credential. So by signing the VP with the private key corresponding to that DID we can prove we 'own' the credentials, or in other words, that the credentials were issued to us (to our DID.)

A VP needn't be signed. It could simply be used as to 'package' together a set of VCs.

A signed VP is also sometimes used for authentication, without any contained VC. Say for the case where when an issuer is issuing a credential to a DID, and the issuer wants to know that the recipient in fact does control that DID. In these cases the VP is typically the response to a request for [DIDAuthentication (DidAuth)](https://w3c-ccg.github.io/vp-request-spec/#did-authentication). This verifier-core library does not, however, provide verification for DidAuthentication, only to verify a presentation containing VCs.

Verifying a VP amounts to verifying the signature on the VP (if the signature exists) and also verifying all of the contained VCs, one by one.

#### arguments

* presentation - The W3C Verifiable Presentation to be verified.
* reloadIssuerRegistry - Whether or not to refresh the cached copy of the registry.
* unsignedPresentation - wether the submitted vp has been signed or not

#### result

With a VP we have a result for the vp as well as for all the contained VCs. Each of the VC results follows exactly the format described above for the results of verifying an individual VCs. We may also have an error.

A successful signed VP result with two packaged VCs might look like so:

```
{
  "presentationResult": {
    "signature": "valid"
  },
  "credentialResults": [
    {
      "log": [
        {
          "id": "valid_signature",
          "valid": true
        },
        {
          "id": "revocation_status",
          "valid": true
        },
        {
          "id": "expiration",
          "valid": true
        },
        {
          "id": "registered_issuer",
          "valid": true,
          "foundInRegistries": [
            "DCC Sandbox Registry"
          ],
          "registriesNotLoaded": []
        }
      ],
      "credential": {vc omitted for brevity/clarity}
    },
    {
      "log": [
        {
          "id": "valid_signature",
          "valid": true
        },
        {
          "id": "revocation_status",
          "valid": true
        },
        {
          "id": "expiration",
          "valid": true
        },
        {
          "id": "registered_issuer",
          "valid": true,
          "matchingIssuers": [
        {
          "issuer": {
            "federation_entity": {
              "organization_name": "DCC did:web test",
              "homepage_uri": "https://digitalcredentials.mit.edu",
              "location": "Cambridge, MA, USA"
            }
          },
          "registry": {
            "name": "DCC Sandbox Registry",
            "type": "dcc-legacy",
            "url": "https://digitalcredentials.github.io/sandbox-registry/registry.json"
          }
        }
      ],
          "uncheckedRegistries": []
        }
      ],
      "credential": {vc omitted for brevity/clarity}
    }
  ]
}
```

A VP that itself verfies (i.e, it's signature), but has one VC that doesn't, might look like so:

```
{
  "presentationResult": {
    "signature": "signed"
  },
  "credentialResults": [
    {
      "credential": {
        "@context": [
          "https://www.w3.org/ns/credentials/v2",
          "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
          "https://w3id.org/security/suites/ed25519-2020/v1"
        ],
        "id": "0923lksjf",
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
      "errors": [
        {
          "name": "invalid_credential_id",
          "message": "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement."
        }
      ]
    }
  ]
}
```

It is important to note in the above example that the validity of the signature of the presentation is different from the validity of each of the contained VCs. A valid presentation signature simply means that nothing in the VP was tampered with.

An unsigned VP containing a single verified credential:

```
{
  "presentationResult": {
    "signature": "unsigned"
  },
  "credentialResults": [
    {
      "log": [
        {
          "id": "valid_signature",
          "valid": true
        },
        {
          "id": "revocation_status",
          "valid": true
        },
        {
          "id": "expiration",
          "valid": true
        },
        {
          "id": "registered_issuer",
          "valid": true,
          "foundInRegistries": [
            "DCC Sandbox Registry"
          ],
          "registriesNotLoaded": []
        }
      ],
      "credential": {vc omitted for brevity/clarity}
    }
  ]
}
```

A VP where we've tampered with one of the packaged credentials (by changing the credential name). Note here that both the VP and the VC don't verify because changing the VC affected the VC's signature and also the VP signature which contains the VC.

```
{
  "presentationResult": {
    "signature": "invalid",
    "errors": [
      {
        "message": {
          "name": "VerificationError",
          "errors": [
            {
              "name": "Error",
              "message": "Invalid signature.",
              "stack": "Error: Invalid signature.\n    at Ed25519Signature2020.verifyProof (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/suites/LinkedDataSignature.js:189:15)\n    at async /Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:273:53\n    at async Promise.all (index 0)\n    at async _verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:261:3)\n    at async ProofSet.verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:195:23)\n    at async Object.verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/jsonld-signatures.js:160:18)\n    at async _verifyPresentation (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/vc/dist/index.js:578:30)\n    at async verifyPresentation (file:///Users/jameschartrand/Documents/github/dcc/verifier-core/dist/src/Verify.js:24:24)\n    at async Context.<anonymous> (file:///Users/jameschartrand/Documents/github/dcc/verifier-core/dist/test/Verify.presentation.spec.js:97:28)"
            }
          ]
        },
        "name": "presentation_error"
      }
    ]
  },
  "credentialResults": [
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
        "name": "Tampered Name",
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
      "errors": [
        {
          "name": "invalid_signature",
          "message": "The signature is not valid."
        }
      ]
    }
  ]
}
```

And here is a VP where just the VP has been tampered with, and not the embedded VC, and so the VC returns as valid, but not the presentation signature:

```
{
  "presentationResult": {
    "signature": "invalid",
    "errors": [
      {
        "name": "presentation_error",
        "message": {
          "name": "VerificationError",
          "errors": [
            {
              "name": "Error",
              "message": "Invalid signature.",
              "stack": "Error: Invalid signature.\n    at Ed25519Signature2020.verifyProof (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/suites/LinkedDataSignature.js:189:15)\n    at async /Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:273:53\n    at async Promise.all (index 0)\n    at async _verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:261:3)\n    at async ProofSet.verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/ProofSet.js:195:23)\n    at async Object.verify (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/jsonld-signatures/lib/jsonld-signatures.js:160:18)\n    at async _verifyPresentation (/Users/jameschartrand/Documents/github/dcc/verifier-core/node_modules/@digitalcredentials/vc/dist/index.js:578:30)\n    at async verifyPresentation (file:///Users/jameschartrand/Documents/github/dcc/verifier-core/dist/src/Verify.js:24:24)\n    at async Context.<anonymous> (file:///Users/jameschartrand/Documents/github/dcc/verifier-core/dist/test/Verify.presentation.spec.js:101:28)"
            }
          ]
        }
      }
    ]
  },
  "credentialResults": [
    {
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
          "id": "registered_issuer",
          "valid": true,
          "foundInRegistries": [
            "DCC Sandbox Registry"
          ],
          "registriesNotLoaded": []
        }
      ],
      "credential": {vc ommitted for clarity/brevity}
    }
  ]
}
```

## Install

- Node.js 20+ is recommended.

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

## License

[MIT License](LICENSE.md) © 2025 Digital Credentials Consortium.
