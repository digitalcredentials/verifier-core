import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify'
import { getVCv2Expired, getVCv1Tampered, getVCv2ValidStatus, getVCv2Tampered } from '../src/test-fixtures/vc'
import { knownDIDRegistries } from '../.knownDidRegistries';

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
    })
    describe('with VC version 2', () => {
  
      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const tamperedVC2 : any = getVCv2Tampered() 
          const result = await verifyCredential({credential: tamperedVC2, reloadIssuerRegistry: true, knownDIDRegistries})
         // console.log("result returned from verifyCredential call:")
         // console.log(JSON.stringify(result,null,2))
          assert.ok(result.verified === false);
          //expect(result.verified).to.be.true
         })
        })


      it('verifies with valid status', async () => {
    const credential : any = getVCv2ValidStatus()
    expectedResult.credential = credential;
    const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
    //console.log("result returned from verifyCredential call:")
    //console.log(JSON.stringify(result,null,2))
    expect(result.verified).to.be.true
    expect(result.credential).to.eql(credential)
    expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
   })

   it('returns unverified when expired', async () => {
    const expiredVC2 : any = getVCv2Expired() 
    const result = await verifyCredential({credential: expiredVC2, reloadIssuerRegistry: true, knownDIDRegistries})
    //console.log("result returned from verifyCredential call:")
   // console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified === false);
    assert.ok(result.log);
    //expect(result.verified).to.be.true
   })
  })
})
})
