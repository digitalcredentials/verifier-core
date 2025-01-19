import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { 
  getVCv2Expired, 
  getVCv1Tampered, 
  getVCv1Expired,  
  getVCv1Revoked, 
  getVCv2Revoked, 
  getVCv1ValidStatus, 
  getVCv2ValidStatus, 
  getVCv2Tampered, 
  getVCv1NoProof, 
  getVCv2NoProof, 
  getCredentialWithoutContext, 
  getCredentialWithoutVCContext, 
  getVCv1NonURIId,
  getVCv2NonURIId,
  getVCv1ExpiredAndTampered,
  getVCv2ExpiredAndTampered,
  getVCv1ExpiredWithValidStatus,
  getVCv2ExpiredWithValidStatus,
  getVCv2EddsaWithValidStatus
} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { 
  getExpectedVerifiedResult, 
  getExpectedUnverifiedResult, 
  getExpectedFatalResult
 } from '../src/test-fixtures/expectedResults.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

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

  describe('.verifyCredential', () => {

    describe('with eddsa signature and', () => { 
      describe('with VC version 1', () => {
      describe('it returns as verified', () => {
      it('when status is valid', async () => {
        const credential : any = getVCv2EddsaWithValidStatus()
        const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
        const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
        expect(result).to.deep.equalInAnyOrder(expectedResult) 
      })
    })
  })

    })
    describe('returns general fatal errors', () => {

      it('when not jsonld', async () => {
        const credential : any = getCredentialWithoutContext() 
        const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})

        const expectedResult = getExpectedFatalResult({
          credential, 
          errorMessage: 'The credential does not appear to be a valid jsonld document - there is no context.',
          errorName: 'invalid_jsonld'
        })
        expect(result).to.deep.equalInAnyOrder(expectedResult) 
      })

      it('when no vc context', async () => {
        const credential : any = getCredentialWithoutVCContext() 
        const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})

        const expectedResult = getExpectedFatalResult({
          credential, 
          errorMessage: "The credential doesn't have a verifiable credential context.",
          errorName: 'no_vc_context'
        })
        expect(result).to.deep.equalInAnyOrder(expectedResult) 
      }) 

    })

    describe('with VC version 1', () => {

      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const credential : any = getVCv1Tampered() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: 'invalid_signature'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

          it('when expired and tampered with', async () => {
            const credential : any = getVCv1ExpiredAndTampered() 
            const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
            const expectedResult = getExpectedFatalResult({
              credential, 
              errorMessage: 'The signature is not valid.',
              errorName: 'invalid_signature'
            })
            expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
          })

        it('when no proof', async () => {
          const credential : any = getVCv1NoProof() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})

          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
            errorName: 'no_proof'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
        it('when credential id is not a uri', async () => {
          const credential : any = getVCv1NonURIId() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
  
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
            errorName: 'invalid_credential_id'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })

      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv1ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv1Expired() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: 'expiration', withStatus:false})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult)
        })
        it('when revoked', async () => {
          const credential : any = getVCv1Revoked() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          assert.ok(result.log);
        })
        
        it('when expired with valid status', async () => {
           const credential : any = getVCv1ExpiredWithValidStatus() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: 'expiration', withStatus:true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

        it('when no matching registry', async () => {
          const credential : any = getVCv1ValidStatus() 
          const noMatchingRegistryList = JSON.parse(JSON.stringify(knownDIDRegistries))
          // set the one matching registry to a url that won't load
          noMatchingRegistryList[1].url = 'https://onlynoyrt.com/registry.json'
          const expectedResult : any = getExpectedVerifiedResult({credential, withStatus: true})
          const expectedRsultRegistryLogEntry = expectedResult.log.find((entry:any)=>entry.id==='registered_issuer')
          expectedRsultRegistryLogEntry.registriesNotLoaded = [
            {
              "name": "DCC Pilot Registry",
              "url": "https://onlynoyrt.com/registry.json"
            }
          ]
          expectedRsultRegistryLogEntry.valid = false;

          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries: noMatchingRegistryList})
          console.log(JSON.parse(JSON.stringify(result)))
          assert.ok(result.log);
        })


      })

      describe('returns accurate registry list', () => {

        it('for non-existant registry url', async () => {
          const credential : any = getVCv1ValidStatus()
          const badRegistryList = JSON.parse(JSON.stringify(knownDIDRegistries))
          badRegistryList[0].url = 'https://onlynoyrt.com/registry.json'
          const expectedResult : any = getExpectedVerifiedResult({credential, withStatus: true})
          expectedResult.log.find((entry:any)=>entry.id==='registered_issuer').registriesNotLoaded = [
            {
              "name": "DCC Pilot Registry",
              "url": "https://onlynoyrt.com/registry.json"
            }
          ]
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries: badRegistryList}) 
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

        it('when all registries exist', async () => {
          const credential : any = getVCv1ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})      
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

      })


    })

    describe('with VC version 2', () => {
  
      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const credential : any = getVCv2Tampered() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: 'invalid_signature'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })

        it('when expired and tampered with', async () => {
          const credential : any = getVCv2ExpiredAndTampered() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: 'invalid_signature'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

         it('when no proof', async () => {
          const credential : any = getVCv2NoProof() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})

          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
            errorName: 'no_proof'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })
        it('when credential id is not a uri', async () => {
          const credential : any = getVCv2NonURIId() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
  
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
            errorName: 'invalid_credential_id'
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })
        
      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv2ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
        
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv2Expired() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: 'expiration', withStatus:false})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult)
        })
        it('when revoked', async () => {
          const credential : any = getVCv2Revoked() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          assert.ok(result.log);
        })
        it('when expired with valid status', async () => {
          // NOTE: TODO - this will continue to fail until we fix https://github.com/digitalcredentials/vc/issues/28
          const credential : any = getVCv2ExpiredWithValidStatus() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: 'expiration', withStatus:true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
           expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

      })
  })
})
})

