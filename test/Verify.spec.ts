//import { expect } from 'chai'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify'
import { getSignedUnrevokedVC2, getTamperedVC1, getExpiredVC2 } from '../src/test-fixtures/vc'

describe('Verify', () => {
  it('verifies with valid status', async () => {
    //const signedVC : any = getSignedVC() 
    const signedVC2Unrevoked : any = getSignedUnrevokedVC2()
    const result = await verifyCredential({credential: signedVC2Unrevoked, reloadIssuerRegistry: true})
    console.log("result returned from verifyCredential call:")
    console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified);
    //expect(result.verified).to.be.true
   })

   it.only('returns fatal error when tampered', async () => {
    const tamperedVC1 : any = getTamperedVC1() 
    const result = await verifyCredential({credential: tamperedVC1, reloadIssuerRegistry: true})
    console.log("result returned from verifyCredential call:")
    console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified === false);
    //expect(result.verified).to.be.true
   })

   it('returns fatal error when tampered', async () => {
    const expiredVC2 : any = getExpiredVC2() 
    const result = await verifyCredential({credential: expiredVC2, reloadIssuerRegistry: true})
    console.log("result returned from verifyCredential call:")
    console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified === false);
    //expect(result.verified).to.be.true
   })

})
