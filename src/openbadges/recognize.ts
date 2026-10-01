/**
 * OpenBadges credential recognition helpers.
 *
 * Pure functions over a credential's `@context` and `type` arrays.
 * Each `is*Credential` helper folds both the OBv3 context match and
 * the type-discrimination check into a single predicate, so callers
 * (the AJV schema check, suite recognizers, consumer UIs) can branch
 * on credential shape without re-implementing the same probe.
 *
 * These helpers do **not** parse or validate the credential — they
 * answer the binary question "should I treat this as an
 * OpenBadgeCredential / EndorsementCredential?" and nothing more.
 */

const OBV3_0_3_CONTEXT_MATCHER =
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3';

export function isOpenBadgeCredential(credential: unknown): boolean {
  return (
    hasObv3Context(credential) && hasType(credential, 'OpenBadgeCredential')
  );
}

export function isEndorsementCredential(credential: unknown): boolean {
  return (
    hasObv3Context(credential) && hasType(credential, 'EndorsementCredential')
  );
}

function hasObv3Context(credential: unknown): boolean {
  const contexts = (credential as { '@context'?: unknown })?.['@context'];
  // String or array: these helpers run against the credential as issued, not
  // a Zod-normalized copy (see the invariant in `verifier.ts`).
  const list = Array.isArray(contexts) ? contexts : [contexts];
  return list.some(
    ctx => typeof ctx === 'string' && ctx.startsWith(OBV3_0_3_CONTEXT_MATCHER)
  );
}

function hasType(credential: unknown, typeName: string): boolean {
  const types = (credential as { type?: unknown })?.type;
  if (typeof types === 'string') {
    return types === typeName;
  }
  if (Array.isArray(types)) {
    return types.some(t => t === typeName);
  }
  return false;
}
