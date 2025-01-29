import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyPresentation } from '../src/Verify.js'
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
  getExpectedFatalResult,
  getExpectedVerifiedPresentationResult
 } from '../src/test-fixtures/expectedResults.js';

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

import { getSignedVP, getUnSignedVP } from './vpUtils.js';
import { VerifiablePresentation } from '../src/types/presentation.js';


    const noProofVC : any = getVCv1NoProof()
    const expectedNoProofResult = getExpectedFatalResult({
                credential: noProofVC, 
                errorMessage: 'This is not a Verifiable Credential - it does not have a digital signature.',
                errorName: 'no_proof'
              })
      

    const badIdVC : any = getVCv2NonURIId()
    const expectedBadIdResult = getExpectedFatalResult({
      credential: badIdVC, 
      errorMessage: "The credential's id uses an invalid format. It may have been issued as part of an early pilot. Please contact the issuer to get a replacement.",
      errorName: 'invalid_credential_id'
    })


    const didWebVC : any = getVCv2DidWebWithValidStatus()
    const expectedDidWebResult = getExpectedVerifiedResult({credential:didWebVC, withStatus: true})
  
    const v2WithStatus : any = getVCv2ValidStatus()
    const expectedV2WithStatusResult = getExpectedVerifiedResult({credential:v2WithStatus, withStatus: true})
      
    const v2Eddsa : any = getVCv2EddsaWithValidStatus()
    const expectedv2EddsaResult = getExpectedVerifiedResult({credential: v2Eddsa, withStatus: true})


chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = false


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

    it('when signed presentation has mix of VCs', async () => {
      const verifiableCredential = [v2WithStatus, v2Eddsa, didWebVC]
      const presentation = await getSignedVP({verifiableCredential, holder: 'did:ex:12345'}) as VerifiablePresentation
      const credentialResults = [expectedV2WithStatusResult, expectedv2EddsaResult, expectedDidWebResult]
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults})
      const result = await verifyPresentation({presentation, knownDIDRegistries})
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
        expectedPresentationResult.presentationResult.signature = 'unsigned'
      }
      const result = await verifyPresentation({presentation, knownDIDRegistries, unsignedPresentation:true})
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })
   
    it('when unsigned presentation not properly specified', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = await getUnSignedVP({verifiableCredential}) as VerifiablePresentation
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      expect(result?.presentationResult?.signature).to.equal('invalid')
    })

    it('when bad presentation', async () => {
      const verifiableCredential= [noProofVC]
      const presentation = await getUnSignedVP({verifiableCredential}) as any
      delete presentation['@context']
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      if (result?.errors) {
        expect(result.errors[0].name).to.equal('presentation_error')
      } else {
        expect(false).to.equal(true)
      }
      
    })

  })

})

 
   

