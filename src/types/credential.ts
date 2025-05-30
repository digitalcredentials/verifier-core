


export type IssuerURI = string;

export interface ImageObject {
  readonly id: string;
  readonly type: string;
}

export interface IssuerObject {
  readonly id: IssuerURI;
  readonly type?: string;
  readonly name?: string;
  readonly url?: string;
  readonly image?: string | ImageObject;
}
export type Issuer = IssuerURI | IssuerObject;

export interface CreditValue {
  value?: string;
}

export interface CompletionDocument {
  readonly type?: string;
  readonly identifier?: string;
  readonly name?: string;
  readonly description?: string;
  readonly numberOfCredits?: CreditValue;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface EducationalOperationalCredentialExtensions {
  readonly type?: string[];
  readonly awardedOnCompletionOf?: CompletionDocument;
  readonly criteria?: {
    type: string;
    narrative: string;
  };
  readonly image?: ImageObject;
}

// https://schema.org/EducationalOccupationalCredential (this doesn't really conform)
export type EducationalOperationalCredential = EducationalOperationalCredentialExtensions & {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly competencyRequired?: string;
  readonly credentialCategory?: string;
  readonly achievementType?: string;
}

export interface DegreeCompletion {
  readonly type: string;
  readonly name: string;
}

export interface StudentId {
  readonly id: string;
  readonly image: string;
}

interface SubjectExtensions {
  readonly type?: string;
  readonly name?: string;
  readonly hasCredential?: EducationalOperationalCredential; // https://schema.org/hasCredential
  readonly degree?: DegreeCompletion;
  readonly studentId?: StudentId;
  // Open Badges v3
  readonly achievement?: EducationalOperationalCredential | EducationalOperationalCredential[];
  readonly identifier?: OBV3IdentifierObject | OBV3IdentifierObject[];
}

export interface OBV3IdentifierObject {
  readonly identityType?: string;
  readonly identityHash?: string;
}

export type Subject = SubjectExtensions & {
  readonly id?: string;
}

export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
  cryptosuite?: string;
  challenge?: string;
  jws?: string;
}

export interface RenderMethod {
  id?: string;
  type: string;
  name?: string;
  css3MediaQuery?: string;
}

// https://www.w3.org/TR/vc-data-model/
export interface CredentialV1 {
  readonly '@context': string[];         // https://www.w3.org/TR/vc-data-model/#contexts
  readonly id?: string;                  // https://www.w3.org/TR/vc-data-model/#identifiers
  readonly type: string[];               // https://www.w3.org/TR/vc-data-model/#types
  readonly issuer: Issuer;               // https://www.w3.org/TR/vc-data-model/#issuer
  readonly issuanceDate: string;         // https://www.w3.org/TR/vc-data-model/#issuance-date
  readonly expirationDate?: string;      // https://www.w3.org/TR/vc-data-model/#expiration
  readonly credentialSubject: Subject;   // https://www.w3.org/TR/vc-data-model/#credential-subject
  readonly credentialStatus?: CredentialStatus | CredentialStatus[]; // https://www.w3.org/TR/vc-data-model/#status
  readonly proof?: Proof;                // https://www.w3.org/TR/vc-data-model/#proofs-signatures
  readonly name?: string;
  readonly renderMethod?: RenderMethod[];
}

// https://www.w3.org/TR/vc-data-model-2.0/
// (At this time, this should be in sync with https://w3c.github.io/vc-data-model/)
export interface CredentialV2 {
  readonly '@context': string[];         // https://www.w3.org/TR/vc-data-model-2.0/#contexts
  readonly id?: string;                  // https://www.w3.org/TR/vc-data-model-2.0/#identifiers
  readonly type: string[];               // https://www.w3.org/TR/vc-data-model-2.0/#types
  readonly issuer: Issuer;               // https://www.w3.org/TR/vc-data-model-2.0/#issuer
  readonly validFrom?: string;           // https://www.w3.org/TR/vc-data-model-2.0/#validity-period
  readonly validUntil?: string;          // https://www.w3.org/TR/vc-data-model-2.0/#validity-period
  readonly credentialSubject: Subject;   // https://www.w3.org/TR/vc-data-model-2.0/#credential-subject
  readonly credentialStatus?: CredentialStatus | CredentialStatus[]; // https://www.w3.org/TR/vc-data-model-2.0/#status
  readonly proof?: Proof;                // https://w3c.github.io/vc-data-model/#proofs-signatures
  readonly name?: string;
  readonly renderMethod?: RenderMethod[]; // https://www.w3.org/TR/vc-data-model-2.0/#reserved-extension-points
}

export type Credential = CredentialV1 | CredentialV2;

// https://www.w3.org/TR/vc-bitstring-status-list
export interface CredentialStatus {
  readonly id: string;
  readonly type: string | string[];
  readonly statusPurpose: string;
  readonly statusListIndex: string | number;
  readonly statusListCredential: string;
}

export enum CredentialError {
  IsNotVerified = 'Credential is not verified.',
  CouldNotBeVerified = 'Credential could not be checked for verification and may be malformed.',
  DidNotInRegistry = 'Could not find issuer in registry with given DID.',
}

export interface CredentialImportReport {
  success: string[];
  duplicate: string[];
  failed: string[];
}
