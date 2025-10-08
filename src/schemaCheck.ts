import { Ajv2019 } from "ajv/dist/2019.js"
import addFormats from "ajv-formats";
import { Credential } from "./types/credential.js"



export const checkSchemas = async (vc: Credential): Promise<any> => {
  try {
    if (vc.credentialSchema) {
      // wrap in array if not already
      const credentialSchemas = [].concat(vc.credentialSchema as any);
      const results = await Promise.all(credentialSchemas.map(async (credentialSchema: any) => {
        const schema = await fetchSchema(credentialSchema.id);
        const ajv = new Ajv2019({ allErrors: true })
        addFormats.default(ajv);
        const validate = ajv.compile(schema)
        const valid = validate(vc)
        const verificationResult = { valid, ...(validate.errors && { errors: validate.errors }) }
        return verificationResult
      }));
      return results;
    } else {
      // will check for OBv3 in context,
      // and use it's schema even if not specified in a vc.credentialSchema
    }

  } catch (e) {
    console.log('error checking schema: ', e)
  }
}

async function fetchSchema(url: string): Promise<object> {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data
  } catch (error) {
    console.error('Error fetching schema:', error);
    throw Error(`Error fetching schema`)
  }
}