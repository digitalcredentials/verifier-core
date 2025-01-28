import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyCredential, verifyPresentation } from '../src/Verify.js'
import { 
  getVCv2DidWebWithValidStatus,
  getVCv2EddsaWithValidStatus,
  getVCv2ValidStatus,
  getVCv1NoProof,
  getVCv2NonURIId
} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { 
  getExpectedVerifiedResult,
  getExpectedVerifiedPresentationResult
 } from '../src/test-fixtures/expectedResults.js';

 import { getSignedDIDAuth, verifyDIDAuth } from './didAuth.js';
import { VerifiablePresentation } from '../src/types/presentation.js';

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

  /* 
  - vp signed
  - vp unsigned
  - passing in good challenge
  - passing in bad challenge
  - vp with bad vc
  - vp with no vcs
   */


  describe('it returns as verified', () => {

    it.only('when signed presentation has one vc', async () => {
      const singleVC : any = getVCv2ValidStatus()
      const verifiableCredential= [singleVC]
      const presentation = await getSignedDIDAuth({holder, verifiableCredential}) as VerifiablePresentation
      const expectedVCResult = getExpectedVerifiedResult({credential:singleVC, withStatus: true})
      const expectedPresentationResult = getExpectedVerifiedPresentationResult({credentialResults:[expectedVCResult]})
  
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      console.log("====================== verification result")
      console.log(JSON.stringify(result,null,2))
      expect(result).to.deep.equalInAnyOrder(expectedPresentationResult)
    })

    it('when presentation is valid', async () => {
      const firstVC : any = getVCv2DidWebWithValidStatus()
      const secondVC : any = getVCv2ValidStatus()
      const noProofVC : any = getVCv1NoProof()
      const badIdVC : any = getVCv2NonURIId()
      const verifiableCredential = [firstVC, secondVC, firstVC]
      // const expectedResult = getExpectedVerifiedResult({credential: verifiableCredential, withStatus: true})
      const presentation = await getSignedDIDAuth({verifiableCredential, holder: 'did:ex:12345'}) as VerifiablePresentation
      // console.log(JSON.stringify(presentation, null, 2))
      const result = await verifyPresentation({presentation, knownDIDRegistries})
      //await verifyDIDAuth({presentation, challenge})
      //console.log("====================== verification result")
      //console.log(JSON.stringify(result,null,2))
      expect(true)
    })


  })
})

 
   

