//import { expect } from 'chai'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify'
import { getSignedUnrevokedVC2 } from '../src/test-fixtures/vc'

describe('Verify', () => {
  it('calls function', async () => {
    //const signedVC : any = getSignedVC() 
    const signedVC2Unrevoked : any = getSignedUnrevokedVC2()
    const result = await verifyCredential({credential: signedVC2Unrevoked, reloadIssuerRegistry: true})
    console.log("result returned from verifyCredential call:")
    console.log(JSON.stringify(result,null,2))
    assert.ok(result.verified);
    //expect(result.verified).to.be.true
   })
})
