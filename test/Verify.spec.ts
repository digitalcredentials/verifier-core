import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { strict as assert } from 'assert';
import { verifyCredential } from '../src/Verify.js'
import { getVCv2Expired, getVCv1Tampered, getVCv1Expired,  getVCv1Revoked, getVCv1ValidStatus, getVCv2ValidStatus, getVCv2Tampered } from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { getExpectedVerifiedResult, getExpectedUnverifiedResult } from '../src/test-fixtures/expectedResults.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

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
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv1Expired() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.log);
        })
        it('when revoked', async () => {
          const credential : any = getVCv1Revoked() 
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          assert.ok(result.log);
        })
      })


    })

    describe('with VC version 2', () => {
  
      describe('returns fatal error', () => {
        it('when tampered with', async () => {
          const tamperedVC2 : any = getVCv2Tampered() 
          const result = await verifyCredential({credential: tamperedVC2, reloadIssuerRegistry: true, knownDIDRegistries})
         })
      })

      describe('returns as verified', () => {
        it('when status is valid', async () => {
          const credential : any = getVCv2ValidStatus()
          const expectedResult = getExpectedVerifiedResult({credential, withStatus: true})
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult) // eslint-disable-line no-use-before-define
        })
      })

      describe('returns as unverified', () => {
        it('when expired', async () => {
          const credential : any = getVCv2Expired() 
          const expectedResult = getExpectedUnverifiedResult({credential, unVerifiedStep: 'expiration', withStatus:false})
          const result = await verifyCredential({credential, reloadIssuerRegistry: true, knownDIDRegistries})
          expect(result).to.deep.equalInAnyOrder(expectedResult)
        })
      })
  })
})
})

