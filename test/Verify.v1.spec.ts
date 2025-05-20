import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { 
  getVCv1Tampered, 
  getVCv1Expired,  
  getVCv1Revoked, 
  getVCv1ValidStatus, 
  getVCv1NoProof, 
  getVCv1NonURIId,
  getVCv1ExpiredAndTampered,
  getVCv1ExpiredWithValidStatus

} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import { 
  getExpectedVerifiedResult, 
  getExpectedUnverifiedResult, 
  getExpectedFatalResult
 } from '../src/test-fixtures/expectedResults.js';
import { INVALID_CREDENTIAL_ID, INVALID_SIGNATURE, NO_PROOF } from '../src/constants/errors.js';
import { EXPIRATION_STEP_ID, REGISTERED_ISSUER_STEP_ID } from '../src/constants/verificationSteps.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = true
/*
tests to add:

- simulatenouly expired and revoked for v1 and v2
- expired but valid status for v1 and v2
- simultaneosly expired and tampered for v1 and v2
- returns registry entries that are retunred by nock call
- returns no registry entry for nock with no result
- returns unverified for issuer DID that doesn't resolve
- returns verified when no status property

*/



describe('Verify', () => {

  const originalLogFunction = console.log;
  let output:string;

  beforeEach(function(done) {
    if (DISABLE_CONSOLE_WHEN_NO_ERRORS) {
      output = '';
      console.log = (msg) => {
        output += msg + '\n';
      };
    }
    done()
  });

  afterEach(function() {
    if (DISABLE_CONSOLE_WHEN_NO_ERRORS) {
      console.log = originalLogFunction; // undo dummy log function
      if (this?.currentTest?.state === 'failed') {
        console.log(output);
      }
    }
  });

  describe('.verifyCredential', () => {

    describe('with VC version 1', () => {

      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const credential : any = getVCv1Tampered() 
          const result = await verifyCredential({credential, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: INVALID_SIGNATURE
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

          it('when expired and tampered with', async () => {
            const credential : any = getVCv1ExpiredAndTampered() 
            const result = await verifyCredential({credential, knownDIDRegistries})
            const expectedResult = getExpectedFatalResult({
              credential, 
              errorMessage: 'The signature is not valid.',
              errorName: INVALID_SIGNATURE
            })
            expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
          })

        it('when no proof', async () => {
          const credential : any = getVCv1NoProof() 
          const result = await verifyCredential({credential, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
            errorName: NO_PROOF
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
        it('when credential id is not a uri', async () => {
          const credential : any = getVCv1NonURIId() 
          const result = await verifyCredential({credential, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
            errorName: INVALID_CREDENTIAL_ID
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })
      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv1ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv1Expired() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: EXPIRATION_STEP_ID, withStatus:false})
          const result = await verifyCredential({credential, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult)
        })
        it('when revoked', async () => {
          const credential : any = getVCv1Revoked() 
          const result = await verifyCredential({credential, knownDIDRegistries})
          assert.ok(result.log);
        })
        
        it('when expired with valid status', async () => {
           const credential : any = getVCv1ExpiredWithValidStatus() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: EXPIRATION_STEP_ID, withStatus:true})
          const result = await verifyCredential({credential, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

        it('when no matching registry', async () => {
          const credential : any = getVCv1ValidStatus() 
          const noMatchingRegistryList = JSON.parse(JSON.stringify(knownDIDRegistries))
          // set the one matching registry to a url that won't load
          noMatchingRegistryList[2].url = 'https://onldynoyrt.com/registry.json'
          const expectedResult : any = getExpectedVerifiedResult({credential, withStatus: true})
          const expectedResultRegistryLogEntry = expectedResult.log.find((entry:any)=>entry.id===REGISTERED_ISSUER_STEP_ID)
          expectedResultRegistryLogEntry.uncheckedRegistries = [
            {
              "name": "DCC Sandbox Registry",
              "type": "dcc-legacy",
              "url": "https://onldynoyrt.com/registry.json"
            }
          ]
          expectedResultRegistryLogEntry.valid = false;
          expectedResultRegistryLogEntry.matchingIssuers = []

          const result = await verifyCredential({credential, knownDIDRegistries: noMatchingRegistryList})
          
          //console.log(JSON.stringify(result, null, 2))
          expect(result).to.deep.equalInAnyOrder(expectedResult)
        })
      })

      describe('returns accurate registry list', () => {

        it('when one registry url does not exist', async () => {
          const credential : any = getVCv1ValidStatus()
          const badRegistryList = JSON.parse(JSON.stringify(knownDIDRegistries))
          badRegistryList[1].url = 'https://onldynoyrt.com/registry.json'
          const expectedResult : any = getExpectedVerifiedResult({credential, withStatus: true})
          expectedResult.log.find((entry:any)=>entry.id===REGISTERED_ISSUER_STEP_ID).uncheckedRegistries = [
            {
              "name": "DCC Pilot Registry",
              "type": "dcc-legacy",
              "url": "https://onldynoyrt.com/registry.json"
            }
          ]
          const result = await verifyCredential({credential, knownDIDRegistries: badRegistryList}) 
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

        it('when two registry urls do not exist', async () => {
          const credential : any = getVCv1ValidStatus()
          const badRegistryList = JSON.parse(JSON.stringify(knownDIDRegistries))
          badRegistryList[1].url = 'https://onldynoyrt.com/registry.json'
          badRegistryList[3].url = 'https://onldynoyrrrt.com/registry.json'
          const expectedResult : any = getExpectedVerifiedResult({credential, withStatus: true})
          expectedResult.log.find((entry:any)=>entry.id===REGISTERED_ISSUER_STEP_ID).uncheckedRegistries = [
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
          const result = await verifyCredential({credential, knownDIDRegistries: badRegistryList}) 
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
        it('when all registries exist', async () => {
          const credential : any = getVCv1ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, knownDIDRegistries})      
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })
    })
})
})

