import { VerificationResponse, VerificationStep, PresentationVerificationResponse } from "src/types/result";

const expectedPresentationResult = {
  "isFatal": false,
  "presentationResult": {
    "signature": 'valid',
  }
}
const expectedResult = {
    "credential": {},
    "isFatal": false,
    "log": [
      {
        "id": "valid_signature",
        "valid": true
      },
      {
        "id": "expiration",
        "valid": true
      },
      {
        "id": "registered_issuer",
        "valid": true,
        "foundInRegistries": [
          "DCC Sandbox Registry"
        ],
        "registriesNotLoaded": []
      }
    ]
  }

  const fatalResult = {
    credential: {},
    isFatal: true,
    errors: [
      {
        name: 'error name goes here, e.g., no_proof',
        message: 'error message goes here'
      }
    ]
  }

  const getCopyOfFatalResult = (credential:object, errorName:string, errorMessage:string) : VerificationResponse => {
    const expectedResultCopy = JSON.parse(JSON.stringify(fatalResult))
    expectedResultCopy.credential = credential;
    expectedResultCopy.errors[0].name = errorName;
    expectedResultCopy.errors[0].message = errorMessage
    return expectedResultCopy;
  }

  const getCopyOfExpectedResult = (credential:object, withStatus: boolean) : VerificationResponse => {
    const expectedResultCopy = JSON.parse(JSON.stringify(expectedResult))
    if (withStatus) {
      expectedResultCopy.log?.push(
        {
          "id": "revocation_status",
          "valid": true
        }
      )
    }
    expectedResultCopy.credential = credential;
    return expectedResultCopy;
  }

  const getCopyOfExpectedVPResult = () : PresentationVerificationResponse => {
    return JSON.parse(JSON.stringify(expectedPresentationResult))
  }


  const getExpectedVerifiedResult = ({credential, withStatus }: {credential:object, withStatus:boolean}) : VerificationResponse => {
    return getCopyOfExpectedResult(credential, withStatus);
  }

  const getExpectedUnverifiedResult = ( {credential, unVerifiedStep, withStatus }: {credential:object, unVerifiedStep:string, withStatus:boolean}) : VerificationResponse => {
    const expectedResult = getCopyOfExpectedResult(credential, withStatus);
    const step = expectedResult.log?.find((entry:VerificationStep)=>entry.id === unVerifiedStep)
    if (step) step.valid = false;
    return expectedResult;
  }

  const getExpectedFatalResult = ( {credential, errorName, errorMessage }: {credential:object, errorName:string, errorMessage:string}) : VerificationResponse => {
    const expectedResult = getCopyOfFatalResult(credential, errorName, errorMessage);
    return expectedResult;
  }

  const getExpectedVerifiedPresentationResult = ({credentialResults}: {credentialResults:VerificationResponse[]}) : PresentationVerificationResponse => {
    const expectedResult = getCopyOfExpectedVPResult();
    expectedResult.credentialResults = credentialResults
    return expectedResult;
  }

  export {
    getExpectedVerifiedResult,
    getExpectedUnverifiedResult,
    getExpectedFatalResult,
    getExpectedVerifiedPresentationResult
  }