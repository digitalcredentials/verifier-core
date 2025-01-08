# verifier-core _(@digitalcredentials/verifier-core)_

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/verifier-core/main.yml?branch=main)](https://github.com/digitalcredentials/verifier-core/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@digitalcredentials/verifier-core.svg)](https://npm.im/@digitalcredentials/verifier-core)

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

  The DCC is actively working on a new trust registry model that will likely extend the registry scope.

## API

This package exports two methods:

* verifyCredential
* verifyPresentation

### verifyCredential

```verifyCredential({credential, reloadIssuerRegistry = true})```

#### arguments

* credential - The W3C Verifiable Credential to be verified.
* reloadIssuerRegistry - A boolean (true/false) indication whether or not to refresh the cached copy of the registry.

#### result

The typescript definitions for the result can be found [here](./src/types/result.ts)

There are four general flavours of result that might be returned:

1. <b>successful verification</b>

A verification is successful if the signature is valid (the credential hasn't been tampered with), hasn't expired, hasn't been revoked, and was signed by a trusted issuer.

A successful verification might look like this example:

```
{
  "verified": true,
  "isFatal": false,
  "credential": {the supplied vc - left out here for brevity/clarity},
  "log": [
    {
      "id": "valid_signature",
      "valid": true
    },
    {
      "id": "issuer_did_resolves",
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
      ]
    }
  ]
}
```

2. <b>unsucessful verification</b>

An unsuccessful verification means that one of the steps (other than the 'valid_signature' step) returned false, so the credential has expired, and/or been revoked, and/or can't be confirmed to be signed by a known issuer. Note that an invalid signature is considered fatal because it means that the revocation status, expiry data, or issuer id may have been changed so we can't say anything conclusive about any of them.

An unsuccessful verification (in this case because the credential has expired) might look like this example:

```
{
  "verified": false,
  "isFatal": false,
  "credential": {the supplied vc - left out here for brevity/clarity},
  "log": [
    {
      "id": "valid_signature",
      "valid": true
    },
    {
      "id": "issuer_did_resolves",
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
      ]
    }
  ]
}
```

3. <b> partially successful verification</b>

A verification might partly succeed if it can verify the signature and the expiry date, but can't retrieve any of the revocation status, the issuer registry, or the issuer's DID document from the network to verify the revocation status and issuer identity.

For those steps that we couldn't verify conclusively one way or the other (true or false) we return an 'error' propery rather than a 'valid' property.

A partially successful verification might look like this example:

```
{
  "verified": false,
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
      "error": {
            "name": "network-error",
            "message": "Could not retrieve the issuer registry."
      }   
    },
    {
      "id": "issuer_did_resolves",
      "error": {
            "name": "network-error",
            "message": "Could not retrieve the issuer DID."
      }   
    }
  ]
}
```

4. <b>fatal error</b>

Fatal errors are errors that prevent us from saying anything conclusive about the credential, and so we don't list the results of each step (the 'log') because we can't say decisively one way or the other if any are true or false. Reverting to saying they are all false would be misleading, because that could be interepreted to mean that the credential was, for example, revoked when really we just don't know one way or the other.

```
{
  "credential": {the vc goes here},
  "isFatal": true,
  "verified": false,
  "errors": [
    {
      "name": "invalidSignature",
      "message": "The signature is not valid."
    }
  ]
}
```
Examples of fatal errors:

* invalid signature
  
Fatal because if the signature is invalid it means any part of the credential could have been tampered with, including the revocation status, expiration, and issuer identity

* software problem
  
A software error might prevent verification

* malformed credential
  
The supplied credential may not conform to the VerifiableCredential or LinkedData specifications(possibly because it follows some older convention, or maybe hasn't yet been signed) and might not even be a Verifiable Credential at all.



### verifyPresentation

```verifyPresentation({presentation, reloadIssuerRegistry = true})```

#### arguments

* presentation - The W3C Verifiable Presentation to be verified.
* reloadIssuerRegistry - Whether or not to refresh the cached copy of the registry.

#### result

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
