import { Ajv2019 } from "ajv/dist/2019.js"
import addFormats from "ajv-formats";
import { Credential } from "./types/credential.js"

const OBV3_0_3_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json';
const OBV3_0_3_SCHEMA = 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json'
const ajv = new Ajv2019({ allErrors: true, loadSchema })
addFormats.default(ajv);

export const checkSchemas = async (vc: Credential): Promise<any> => {
  try {
    if (vc.credentialSchema) {
      // wrap all schemas in array if not already
      const credentialSchemas = [].concat(vc.credentialSchema as any);
      const results = await Promise.all(credentialSchemas.map(async (credentialSchema: any) => {
        return await validate(credentialSchema.id, vc);
      }));
      return results;
    } else {
      // no credentialSchema was specified so try to guess based on context
      // TODO make sure to indicate in results that this is a guess based on context                        
      if (vc["@context"].includes(OBV3_0_3_CONTEXT)) {
        return [await validate(OBV3_0_3_SCHEMA, vc)];
      } else {
        return {result: 'NO_SCHEMA'}
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