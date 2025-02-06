import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { 
  getVCv2Expired, 
  getVCv2Revoked, 
  getVCv2ValidStatus, 
  getVCv2Tampered, 
  getVCv2NoProof, 
  getCredentialWithoutContext, 
  getCredentialWithoutVCContext, 
  getVCv2NonURIId,
  getVCv2ExpiredAndTampered,
  getVCv2ExpiredWithValidStatus,
  getVCv2EddsaWithValidStatus,
  getVCv2DoubleSigWithBadStatusUrl,
  getVCv2DidWebWithValidStatus,
  getVCv2WithBadDidWebUrl

} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { 
  getExpectedVerifiedResult, 
  getExpectedUnverifiedResult, 
  getExpectedFatalResult
 } from '../src/test-fixtures/expectedResults.js';
import { EXPIRATION_STEP_ID, REVOCATION_STATUS_STEP_ID } from '../src/constants/verificationSteps.js';
import { DID_WEB_UNRESOLVED, INVALID_CREDENTIAL_ID, INVALID_SIGNATURE, NO_PROOF, STATUS_LIST_NOT_FOUND } from '../src/constants/errors.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = true

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

    describe('with VC version 2', () => {
      
      describe('and ed25519 and eddsa signature', () => { 
        describe('returns log error', () => {
          it('when statuslist url is unreachable', async () => {
            const credential : any = getVCv2DoubleSigWithBadStatusUrl()
            const expectedResult = getExpectedVerifiedResult({credential, withStatus: false})
            expectedResult.log?.push(
            {
              "id": REVOCATION_STATUS_STEP_ID,
              "error": {
                "name": STATUS_LIST_NOT_FOUND,
                "message": "NotFoundError loading \"https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5VK8CbZ1GjycuPombrj\": Request failed with status code 404 Not Found: GET https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5VK8CbZ1GjycuPombrj"
              }
            })
            const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
            expect(result).to.deep.equalInAnyOrder(expectedResult) 
          })

    })
  })
      describe('with eddsa signature', () => { 
        describe('it returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv2EddsaWithValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          
         // console.log(JSON.stringify(result,null,2))
          
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })

    })


      describe('returns fatal error', () => {

        it('when tampered with', async () => {
          const credential : any = getVCv2Tampered() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: INVALID_SIGNATURE
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })

        it('when expired and tampered with', async () => {
          const credential : any = getVCv2ExpiredAndTampered() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'The signature is not valid.',
            errorName: INVALID_SIGNATURE
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

         it('when no proof', async () => {
          const credential : any = getVCv2NoProof() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})

          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
            errorName: NO_PROOF
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })
        it('when credential id is not a uri', async () => {
          const credential : any = getVCv2NonURIId() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
  
          const expectedResult = getExpectedFatalResult({
            credential, 
            errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
            errorName: INVALID_CREDENTIAL_ID
          })
          expect(result).to.deep.equalInAnyOrder(expectedResult) 
        })
        
        it('when did:web url is unreachable', async () => {
          const credential : any = getVCv2WithBadDidWebUrl()
          const errorName = DID_WEB_UNRESOLVED
          const errorMessage = "The signature could not be checked because the public signing key could not be retrieved from https://digitalcredentials.github.io/dcc-did-web-bad/did.json"
          const expectedResult = getExpectedFatalResult({credential, errorName, errorMessage}) 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
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
        describe('with did:web issuer', () => {

          it('when status is valid', async () => {
            const credential : any = getVCv2DidWebWithValidStatus()
            const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
            const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
            expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
          })
        
          it('with different issuer for vc and statusList ', async () => {
            const credential : any = getVCv2DidWebWithValidStatus()
            const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
            const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
            expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
          })

      })
        
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv2Expired() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: EXPIRATION_STEP_ID, withStatus:false})
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
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: EXPIRATION_STEP_ID, withStatus:true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
           expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })

      })
  })
})
})
})