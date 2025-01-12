import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { getVCv2Expired, getVCv1Tampered, getVCv1Expired,  getVCv1ValidStatus, getVCv2ValidStatus, getVCv2Tampered } from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const expectedResult = {
  "verified": true,
  "credential": null,
  "isFatal": false,
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

describe('Verify', () => {
  describe('.verifyCredential', () => {

    describe('with VC version 1', () => {

      describe('returns fatal error', () => {

        it('when tampered with', async () => {
          const tamperedVC1 : any = getVCv1Tampered() 
          const result = await verifyCredential({credential: tamperedVC1, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.verified === false);
        })

      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv1ValidStatus()
          expectedResult.credential = credential;
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv1Expired() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.verified === false);
          assert.ok(result.log);
        })
      })


    })

    describe('with VC version 2', () => {
  
      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const tamperedVC2 : any = getVCv2Tampered() 
          const result = await verifyCredential({credential: tamperedVC2, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.verified === false);
         })
      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv2ValidStatus()
          expectedResult.credential = credential;
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv2Expired() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.verified === false);
          assert.ok(result.log);
        })
      })
  })
})
})
