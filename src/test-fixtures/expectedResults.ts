import { VerificationResponse, VerificationStep } from "src/types/result";

const expectedResult = {
    "credential": {},
    "isFatal": false,
    "log": [
      {
        "id": "valid_signature",
        "valid": true
      },
      {
        "id": "issuer_did_resolves",
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
        ]
      }
    ]
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

  export const getExpectedVerifiedResult = ({credential, withStatus }: {credential:object, withStatus:boolean}) : VerificationResponse => {
    return getCopyOfExpectedResult(credential, withStatus);
  }

  export const getExpectedUnverifiedResult = ( {credential, unVerifiedStep, withStatus }: {credential:object, unVerifiedStep:string, withStatus:boolean}) : VerificationResponse => {
    const expectedResult = getCopyOfExpectedResult(credential, withStatus);
    const step = expectedResult.log?.find((entry:VerificationStep)=>entry.id === unVerifiedStep)
    if (step) step.valid = false;
    return expectedResult;
  }