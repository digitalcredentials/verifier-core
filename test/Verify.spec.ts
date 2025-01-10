import { expect } from 'chai'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify'
import { getVCv2Expired, getVCv1Tampered, getVCv2ValidStatus } from '../src/test-fixtures/vc'
import { knownDIDRegistries } from '../.knownDidRegistries';

describe('Verify', () => {
  it('verifies with valid status', async () => {
    const credential : any = getVCv2ValidStatus()
    const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
    console.log("result returned from verifyCredential call:")
    console.log(JSON.stringify(result,null,2))
    expect(result.verified).to.be.true
    expect(result.credential).to.eql(credential)
   })

   it('returns fatal error when tampered', async () => {
    const tamperedVC1 : any = getVCv1Tampered() 
    const result = await verifyCredential({credential: tamperedVC1, reloadIssuerRegistry: true, knownDIDRegistries})
   // console.log("result returned from verifyCredential call:")
   // console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified === false);
    //expect(result.verified).to.be.true
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
