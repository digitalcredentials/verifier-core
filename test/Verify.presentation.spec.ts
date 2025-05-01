import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyPresentation } from '../src/index.js'
import { 
  getVCv1SimpleIssuerId,
  getVCv2SimpleIssuerId,
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

import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import { 
  getExpectedVerifiedResult,
  getExpectedUnverifiedResult, 
  getExpectedFatalResult,
  getExpectedVerifiedPresentationResult
 } from '../src/test-fixtures/expectedResults.js';

 import {
  getVCv1,
  getVCv1Tampered, 
  getVCv1Expired,  
  getVCv1Revoked, 
  getVCv1ValidStatus, 
  getVCv1NoProof, 
  getVCv1NonURIId,
  getVCv1ExpiredAndTampered,
  getVCv1ExpiredWithValidStatus
} from '../src/test-fixtures/vc.js'

import { getSignedVP, getUnSignedVP } from './vpUtils.js';
import { VerifiablePresentation } from '../src/types/presentation.js';
import { INVALID_CREDENTIAL_ID, INVALID_SIGNATURE, NO_PROOF, PRESENTATION_ERROR } from '../src/constants/errors.js';
import { SIGNATURE_INVALID, SIGNATURE_UNSIGNED } from '../src/constants/verificationSteps.js';


    const noProofVC : any = getVCv1NoProof()
    const expectedNoProofResult = getExpectedFatalResult({
                credential: noProofVC, 
                errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
                errorName: NO_PROOF
              })
      

    const badIdVC : any = getVCv2NonURIId()
    const expectedBadIdResult = getExpectedFatalResult({
      credential: badIdVC, 
      errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
      errorName: INVALID_CREDENTIAL_ID
    })


    const didWebVC : any = getVCv2DidWebWithValidStatus()
    const expectedDidWebResult = getExpectedVerifiedResult({credential:didWebVC, withStatus: true})
  
    const v2WithStatus : any = getVCv2ValidStatus()
    const expectedV2WithStatusResult = getExpectedVerifiedResult({credential:v2WithStatus, withStatus: true})
      
    const v1NoStatus : any = getVCv1()
    const expectedV1Result = getExpectedVerifiedResult({credential:v1NoStatus, withStatus: false})

    
    const v2Eddsa : any = getVCv2EddsaWithValidStatus()
    const expectedv2EddsaResult = getExpectedVerifiedResult({credential: v2Eddsa, withStatus: true})

    const v1SimpleIssuerId : any = getVCv1SimpleIssuerId()
    const expectedV1SimpleIssuerResult = getExpectedVerifiedResult({credential:v1SimpleIssuerId, withStatus: false})

    const v2SimpleIssuerId : any = getVCv2SimpleIssuerId()
    const expectedV2SimpleIssuerResult = getExpectedVerifiedResult({credential:v2SimpleIssuerId, withStatus: false})

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = true


describe('Verify.verifyPresentation', () => {

  const holder = 'did:ex:12345';

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

  describe('it returns as verified', () => {
    
    it('with v1 and v2 vcs with simple issuer ids', async () => {
      const verifiableCredential= [v1SimpleIssuerId, v2SimpleIssuerId]
      const presentation = await getSignedVP({holder, verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedV1SimpleIssuerResult,expectedV2SimpleIssuerResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it('when signed presentation has one vc in an array', async () => {
      const verifiableCredential= [v2WithStatus]
      const presentation = await getSignedVP({holder, verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedV2WithStatusResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it('when unsigned presentation has one vc not in an array', async () => {
      const verifiableCredential= v2WithStatus
      const presentation = await getUnSignedVP({verifiableCredential}) as any
      presentation.verifiableCredential = presentation.verifiableCredential[0]
      const credentialResults = [expectedV2WithStatusResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults, unsigned:true})
      const result = await verifyPresentation({presentation, knownDIDRegistries, unsignedPresentation: true})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it.skip('when signed presentation has mix of VCs', async () => {
      const verifiableCredential = [v2WithStatus, v2Eddsa, didWebVC]
      const presentation = await getSignedVP({verifiableCredential, holder: 'did:ex:12345'}) as VerifiablePresentation
      const credentialResults = [expectedV2WithStatusResult, expectedv2EddsaResult, expectedDidWebResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      console.log("expected result:")
      console.log(JSON.stringify(expectedPresentationResult,null,2))
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      console.log("actual result:")
      console.log(JSON.stringify(result,null,2))
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it('when wrong challenge and presentation purpose', async () => {
      const verifiableCredential= [v2WithStatus]
      const presentation = await getSignedVP({holder, verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedV2WithStatusResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      const result = await verifyPresentation({presentation, knownDIDRegistries, challenge: 'blahblahblue'})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

  })

  describe('it returns as unverified', () => {
    
    

    it('when vc in signed presentation has been tampered with', async () => {
      const v1 : any = getVCv1()
      const verifiableCredential= [v1]
      const presentation = await getSignedVP({holder, verifiableCredential}) as any
      presentation.verifiableCredential[0].name = 'Tampered Name'
      const result = await verifyPresentation({presentation, knownDIDRegistries}) as any
      expect(result.presentationResult.signature).to.equal(SIGNATURE_INVALID)
      expect(result.credentialResults[0].errors[0].name).to.equal(INVALID_SIGNATURE)
    })

    it('when signed presentation has been tampered with', async () => {
      const verifiableCredential= [v1NoStatus]
      const presentation = await getSignedVP({holder, verifiableCredential}) as any
      presentation.holder = 'did:ex:tampered'
      const result = await verifyPresentation({presentation, knownDIDRegistries}) as any
      const expectedCredentialResults = [expectedV1Result]
      expect(result.credentialResults).to.deep.equalInAnyOrder(expectedCredentialResults)
      expect(result.presentationResult.signature).to.equal(SIGNATURE_INVALID)
    })

    it('when unsigned presentation has bad vc', async () => {
      /// NOTE that this is an unsigned vp because the vc libs signing
      // method doesn't allow signing a VP with a 'bad' VC, so
      // we can't easily get a test vp
      const verifiableCredential= [badIdVC]
      const presentation = await getUnSignedVP({verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedBadIdResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults, unsigned: true})
      const result = await verifyPresentation({presentation, knownDIDRegistries, unsignedPresentation: true})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)

    })

    it('when signed presentation has no proof vc', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = await getSignedVP({holder, verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedNoProofResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it('when unsigned presentation', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = getUnSignedVP({verifiableCredential}) as VerifiablePresentation
      const credentialResults = [expectedNoProofResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      if (expectedPresentationResult?.presentationResult) {
        expectedPresentationResult.presentationResult.signature = SIGNATURE_UNSIGNED
      }
      const result = await verifyPresentation({presentation, knownDIDRegistries, unsignedPresentation:true})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })
   
    it('when unsigned presentation not properly specified', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = await getUnSignedVP({verifiableCredential}) as VerifiablePresentation
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      expect(result?.presentationResult?.signature).to.equal(SIGNATURE_INVALID)
    })

    it('when bad presentation', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = await getUnSignedVP({verifiableCredential}) as any
      delete presentation['@context']
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      if (result?.errors) {
        expect(result.errors[0].name).to.equal(PRESENTATION_ERROR)
      } else {
        expect(false).to.equal(true)
      }
      
    })

  })

})

 
   

