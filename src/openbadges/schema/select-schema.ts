/**
 * Which vendored Open Badges schema applies to a credential.
 *
 * Chosen from the credential's OB type and VC version only. The credential's
 * own `credentialSchema` never takes part: an issuer could otherwise name a
 * permissive schema and skip the Open Badges one.
 */

import {
  isEndorsementCredential,
  isOpenBadgeCredential
} from '../recognize.js';
import {
  VENDORED_OB_SCHEMAS,
  type VendoredObSchema
} from './json-schema/index.js';

export type ObType = VendoredObSchema['obType'];
export type VcVersion = VendoredObSchema['vcVersion'];

export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
export const VC_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1';

/**
 * The Open Badges type of a credential, or `null` for anything else. An
 * `OpenBadgeCredential` is checked first, so a credential carrying both types
 * is treated as an achievement credential.
 */
export function getObType(credential: Record<string, unknown>): ObType | null {
  if (isOpenBadgeCredential(credential)) {
    return 'OpenBadgeCredential';
  }
  if (isEndorsementCredential(credential)) {
    return 'EndorsementCredential';
  }
  return null;
}

/**
 * Determine VC version from contexts: `'v2'` if any context is the VC 2.0
 * context, else `'v1'` for the VC 1.1 context, else `null`.
 */
export function getVcVersion(
  credential: Record<string, unknown>
): VcVersion | null {
  const contexts = credential['@context'];
  // String or array: the credential arrives as issued, not Zod-normalized
  // (see the invariant in `verifier.ts`).
  const list = Array.isArray(contexts) ? contexts : [contexts];

  const stringContexts = list.filter(
    (ctx): ctx is string => typeof ctx === 'string'
  );

  if (stringContexts.some(ctx => ctx.startsWith(VC_V2_CONTEXT))) {
    return 'v2';
  }
  if (stringContexts.some(ctx => ctx.startsWith(VC_V1_CONTEXT))) {
    return 'v1';
  }
  return null;
}

/** The vendored schema for an OB type and VC version. */
export function vendoredSchemaFor(
  obType: ObType,
  vcVersion: VcVersion
): VendoredObSchema {
  const found = VENDORED_OB_SCHEMAS.find(
    s => s.obType === obType && s.vcVersion === vcVersion
  );
  if (!found) {
    // Unreachable while all four schemas are vendored.
    throw new Error(
      `No vendored Open Badges schema for ${obType} / ${vcVersion}`
    );
  }
  return found;
}
