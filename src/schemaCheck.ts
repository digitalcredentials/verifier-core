import { Ajv2019 } from "ajv/dist/2019.js"
import addFormats from "ajv-formats";
import { Credential } from "./types/credential.js"
import { VerificationResponse, AdditionalInformationEntry } from './types/result.js';
import { SCHEMA_ENTRY_ID } from './constants/verificationSteps.js';

const OBV3_0_3_CONTEXT_MATCHER = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3';
const OBV3_SCHEMA_V1_ACHIEVEMENT = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json-ld/ob_v3p0_anyachievementcredential_schema.json'
const OBV3_SCHEMA_V1_ENDORSEMENT = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json-ld/ob_v3p0_anyendorsementcredential_schema.json'
const OBV3_SCHEMA_V2_ACHIEVEMENT = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json'
const OBV3_SCHEMA_V2_ENDORSEMENT = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorsementcredential_schema.json'

const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'
const VC_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1'

const ajv = new Ajv2019({ allErrors: true, loadSchema })
addFormats.default(ajv);

export const checkSchemas = async (vc: Credential): Promise<any> => {
  try {
    if (vc.credentialSchema) {
      // wrap all schemas in array if not already an array
      const credentialSchemas = [].concat(vc.credentialSchema as any);
      // get schema validation results for all listed schemas
      const results = await Promise.all(credentialSchemas.map(async (credentialSchema: any) => {
        const result = await validate(credentialSchema.id, vc);
        return { schema: credentialSchema.id, result, source: 'Schema was listed in the credentialSchema property of the VC' }
      }));
      return { results };
    } else {
      // no credentialSchema was specified so try to guess based on context
      // and the Verifiable Credentials version.    
      const contextsToCheck = vc["@context"].filter(entry=>typeof entry === 'string')
      const hasOBv3Context = contextsToCheck.some(context => context.startsWith(OBV3_0_3_CONTEXT_MATCHER))                  
      if (hasOBv3Context) {
        const isVC2 = (contextsToCheck.some(context => context.startsWith(VC_V2_CONTEXT)));
        const isVC1 = (contextsToCheck.some(context => context.startsWith(VC_V1_CONTEXT)));
        let obType = '';
        let schema;

        if (vc.type?.includes('OpenBadgeCredential')) {
          obType = 'OpenBadgeCredential';
          if (isVC1) {
            schema = OBV3_SCHEMA_V1_ACHIEVEMENT
          } else if (isVC2) {
            schema = OBV3_SCHEMA_V2_ACHIEVEMENT
          } else {
            schema = null;
          }
        } else if (vc.type?.includes('EndorsementCredential')) {
           obType = 'EndorsementCredential';
          if (isVC1) {
            schema = OBV3_SCHEMA_V1_ENDORSEMENT
          } else if (isVC2) {
            schema = OBV3_SCHEMA_V2_ENDORSEMENT
          } else {
            schema = null
          }
        }
        // if we were able guess at a schema then validate against it
        if (schema) {
          const result = await validate(schema, vc);
          const vcVersion = isVC2 ? 'version 2' : 'version 1';
          const results = [{ schema, result, source: `Assumed based on vc.type: '${obType}' and vc version: '${vcVersion}'` }]
          return { results };
        } else {
          // couldn't guess at a schema, likely
          // because the OBv3 was neither an Endorsement nor an Achievement
          return { results: 'NO_SCHEMA' }
        }
      } else {
        // no context was listed for which we know of a schema
        return { results: 'NO_SCHEMA' }
      }
    }

  } catch (e) {
    console.log('error checking schema: ', e)
  }
}

async function validate(schemaURL: string, vc: Credential): Promise<object> {
  const validate = ajv.getSchema(schemaURL) || await ajv.compileAsync({ $ref: schemaURL })
  const valid = validate(vc)
  const verificationResult = { valid, ...(validate.errors && { errors: validate.errors }) }
  return verificationResult
}

async function loadSchema(url: string): Promise<object> {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data
  } catch (error) {
    console.error('Error fetching schema:', error);
    throw Error(`Error fetching schema`)
  }
}

export const addSchemaCheckToVerificationResponse = async ({ verificationResponse, credential }: { verificationResponse: VerificationResponse, credential: Credential }): Promise<void> => {
  const schemaResult = await checkSchemas(credential);

  const schemaEntry: AdditionalInformationEntry = {
    "id": SCHEMA_ENTRY_ID,
    ...schemaResult
  };

  (verificationResponse.additionalInformation ??= []).push(schemaEntry)

}