
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
    "registriesNotLoaded"?: RegistriesNotLoaded[]
  }
  
  export interface VerificationResponse {
    "isFatal": boolean,			
    "credential": object,
    "errors"?: VerificationError[],
    "log"?: VerificationStep[]
  }

  export interface RegistryListResult {
    foundInRegistries: string[] 
    registriesNotLoaded: RegistriesNotLoaded[]
  }
  
  export interface RegistriesNotLoaded {name: string, url: string}