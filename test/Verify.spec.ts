import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { getVCv2Expired, getVCv1Tampered, getVCv1Expired,  getVCv1Revoked, getVCv2Revoked, getVCv1ValidStatus, getVCv2ValidStatus, getVCv2Tampered, getVCv1NoProof, getVCv2NoProof, getCredentialWithoutContext } from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { getExpectedVerifiedResult, getExpectedUnverifiedResult, getExpectedFatalResult } from '../src/test-fixtures/expectedResults.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

describe('Verify', () => {

  describe('.verifyCredential', () => {

    describe('general fatal errors', () => {
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
      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv1ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv1Expired() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          assert.ok(result.log);
        })
        it('when revoked', async () => {
          const credential : any = getVCv1Revoked() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: false, knownDIDRegistries})
          assert.ok(result.log);
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
      })
  })
})
})

