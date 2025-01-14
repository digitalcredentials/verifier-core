export interface VerificationError {								
    "message": string,
    "isFatal": boolean,
    "name"?: string,
    stackTrace?: string
  }
  
  export interface VerificationStep {
    "id": string,
    "valid": boolean,
    "foundInRegistries"?: string[],
  }
  
  export interface VerificationResponse {
    "isFatal": boolean,			
    "credential": object,
    "errors"?: VerificationError[],
    "log"?: VerificationStep[]
  }