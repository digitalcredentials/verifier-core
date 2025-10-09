import { Ajv2019 } from "ajv/dist/2019.js"
import addFormats from "ajv-formats";
import { Credential, CredentialSchema } from "./types/credential.js"

const ajv = new Ajv2019({ allErrors: true, loadSchema })
addFormats.default(ajv);

export const checkSchemas = async (vc: Credential): Promise<any> => {
  try {
    if (vc.credentialSchema) {
      // wrap in array if not already
      const credentialSchemas = [].concat(vc.credentialSchema as any);
      const results = await Promise.all(credentialSchemas.map(async (credentialSchema: any) => {
        return await validate(credentialSchema.id, vc);
      }));
      return results;
    } else {
      // will check for OBv3 in context,
      // and use it's schema even though it's not specified in vc.credentialSchema
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