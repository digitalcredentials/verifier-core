import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyCredential, verifyPresentation } from '../src/Verify.js'
import { 
  getVCv2DidWebWithValidStatus,
  getVCv2EddsaWithValidStatus,
  getVCv2ValidStatus,
} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../.knownDidRegistries.js';
import { 
  getExpectedVerifiedResult
 } from '../src/test-fixtures/expectedResults.js';

 import { getSignedDIDAuth, verifyDIDAuth } from './didAuth.js';

chai.use(deepEqualInAnyOrder);
const {expect} = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = false


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

  describe('.verifyPresentation', () => {

      describe('it returns as verified', () => {

      it.only('when presentation is valid', async () => {
        const challenge = '2223q23'
        const firstVC : any = getVCv2DidWebWithValidStatus()
        const secondVC : any = getVCv2ValidStatus()
        const verifiableCredential = [firstVC, secondVC]
       // const expectedResult = getExpectedVerifiedResult({credential: verifiableCredential, withStatus: true})
        const presentation = await getSignedDIDAuth({challenge, verifiableCredential, holder: 'did:ex:12345'})
        console.log(JSON.stringify(presentation, null, 2))
        const result = await verifyPresentation(presentation, challenge)
        //await verifyDIDAuth({presentation, challenge})
        console.log("====================== verification result")
        console.log(JSON.stringify(result,null,2))
        expect(true)
      })
    })
  })

    })
   

