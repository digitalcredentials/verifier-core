import chai from 'chai'
import deepEqualInAnyOrder from 'deep-equal-in-any-order'
import { verifyCredential } from '../src/Verify.js'
import {
  getCredentialWithoutContext,
  getCredentialWithoutVCContext,
} from '../src/test-fixtures/vc.js'
import { knownDIDRegistries } from '../src/test-fixtures/knownDidRegistries.js';
import {
  getExpectedFatalResult
} from '../src/test-fixtures/expectedResults.js';
import { INVALID_JSONLD, NO_VC_CONTEXT } from '../src/constants/errors.js';

chai.use(deepEqualInAnyOrder);
const { expect } = chai;

const DISABLE_CONSOLE_WHEN_NO_ERRORS = true

describe('Verify', () => {

  const originalLogFunction = console.log;
  let output: string;

  beforeEach(function (done) {
    if (DISABLE_CONSOLE_WHEN_NO_ERRORS) {
      output = '';
      console.log = (msg) => {
        output += msg + '\n';
      };
    }
    done()
  });

  afterEach(function () {
    if (DISABLE_CONSOLE_WHEN_NO_ERRORS) {
      console.log = originalLogFunction; // undo dummy log function
      if (this?.currentTest?.state === 'failed') {
        console.log(output);
      }
    }
  });

  describe('.verifyCredential', () => {

    describe('returns fatal errors', () => {

      it('when not jsonld', async () => {
        const credential: any = getCredentialWithoutContext()
        const result = await verifyCredential({ credential, knownDIDRegistries })
        const expectedResult = getExpectedFatalResult({
          credential,
          errorMessage: 'The credential does not appear to be a valid jsonld document - there is no context.',
          errorName: INVALID_JSONLD
        })
        expect(result).to.deep.equalInAnyOrder(expectedResult)
      })

      it('when no vc context', async () => {
        const credential: any = getCredentialWithoutVCContext()
        const result = await verifyCredential({ credential, knownDIDRegistries })

        const expectedResult = getExpectedFatalResult({
          credential,
          errorMessage: "The credential doesn't have a verifiable credential context.",
          errorName: NO_VC_CONTEXT
        })
        expect(result).to.deep.equalInAnyOrder(expectedResult)
      })

    })
  })
})