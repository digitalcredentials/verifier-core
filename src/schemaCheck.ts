import { Ajv } from "ajv"
import { Credential } from "./types/credential.js"

export const checkSchemas = async (vc: Credential) => {
  try {
    const ajv = new Ajv({ allErrors: true }) // options can be passed, e.g. {allErrors: true}
    let schemaURL;
    if (vc.credentialSchema) {
      // wrap in array if not already
      const credentialSchemas = [].concat(vc.credentialSchema as any);
      const results = await Promise.all(credentialSchemas.map(async (credentialSchema: any) => {
        const schemaURL = credentialSchema.id
        const schema = await fetchSchema(schemaURL);
        console.log("THE SCHEMA:")
        console.log(schema)
        const validate = ajv.compile(schema)
        const valid = validate(vc)
        return valid ? { valid } : { valid, errors: validate.errors }
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

async function fetchSchema(url: string) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}