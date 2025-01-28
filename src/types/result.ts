
export interface VerificationError {								
    "message": string,
    "name"?: string,
    "stackTrace"?: any
  }
  
  export interface VerificationStep {
    "id": string,
    "valid"?: boolean,
    "foundInRegistries"?: string[],
    "registriesNotLoaded"?: RegistriesNotLoaded[],
    "error"?: VerificationError
  }
  
  export interface VerificationResponse {
    "isFatal": boolean,			
    "credential": object,
    "errors"?: VerificationError[],
    "log"?: VerificationStep[]
  }


  const signatureOptions = ['valid', 'invalid', 'unsigned'] as const;
  export type PresentationSignatureResult = typeof signatureOptions[number]; //'valid', 'invalid', 'unsigned'

  export interface PresentationResult {
    "signature":PresentationSignatureResult,
    "error"?: any
  }

  export interface PresentationVerificationResponse {
    "isFatal": boolean,			
    "credentialResults"?: VerificationResponse[],
    "presentationResult"?: PresentationResult,
    "errors"?: VerificationError[]
  }

  export interface RegistryListResult {
    foundInRegistries: string[] 
    registriesNotLoaded: RegistriesNotLoaded[]
  }
  
  export interface RegistriesNotLoaded {name: string, url: string}