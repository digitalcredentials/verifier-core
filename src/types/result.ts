
export type VerificationError = {								
    "message": string,
    "isFatal": boolean,
    "name"?: string,
    stackTrace?: string
  }
  
  export type VerificationStep = {
    "id": string,
    "valid": boolean,
    "foundInRegistries"?: string[],
    "registriesNotLoaded"?: RegistriesNotLoaded[]
  }
  
  export type VerificationResponse  = {
    "isFatal": boolean,			
    "credential": object,
    "errors"?: VerificationError[],
    "log"?: VerificationStep[]
  }

  export type RegistryListResult = {
    foundInRegistries: string[] 
    registriesNotLoaded: RegistriesNotLoaded[]
  }
  
  export type RegistriesNotLoaded = {name: string, url: string}