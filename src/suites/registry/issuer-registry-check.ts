import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';

/**
 * Extract issuer DID from credential.
 */
function getIssuerDid(credential: Record<string, unknown>): string | undefined {
  const issuer = credential.issuer as string | { id: string } | undefined;

  if (typeof issuer === 'string') {
    return issuer;
  }

  if (issuer && typeof issuer === 'object' && 'id' in issuer) {
    return (issuer as { id: string }).id;
  }

  return undefined;
}

/**
 * Issuer registry check.
 *
 * Looks up the credential's issuer DID in known DID registries to determine
 * if the issuer is trusted/registered. This is a non-fatal informational check.
 *
 * Requires {@link VerificationContext.lookupIssuers} to be set — the
 * `Verifier` factory always populates it. Hand-built contexts that omit
 * it cause this check to skip.
 *
 * Skipped when:
 * - No registries provided in VerificationContext
 * - No `lookupIssuers` in VerificationContext
 *
 * Success when:
 * - Issuer found in at least one registry
 *
 * Failure when:
 * - Issuer not found in any registry
 */
export const issuerRegistryCheck: VerificationCheck = {
  id: 'registry.issuer',
  name: 'Issuer Registry Check',
  description: 'Checks if the issuer DID appears in known DID registries.',
  fatal: false,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;

    if (!credential) {
      return {
        status: 'skipped',
        reason: 'No verifiable credential found in subject.'
      };
    }

    // Skip if no registries in context
    if (!context.registries) {
      return {
        status: 'skipped',
        reason: 'No registries configured in verification context.'
      };
    }

    const issuerDid = getIssuerDid(credential);

    if (!issuerDid) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.ISSUER_NOT_FOUND,
            title: 'Issuer Not Found',
            detail: 'Credential has no issuer or issuer ID is missing.'
          }
        ]
      };
    }

    const lookupIssuers = context.lookupIssuers;
    if (!lookupIssuers) {
      return {
        status: 'skipped',
        reason: 'No lookupIssuers in verification context.'
      };
    }

    try {
      const result = await lookupIssuers(issuerDid, context.registries);

      if (result.found) {
        const message =
          result.matchingRegistries.length === 1
            ? `Issuer found in registry: ${result.matchingRegistries[0]}`
            : `Issuer found in ${result.matchingRegistries.length} registries: ${result.matchingRegistries.join(', ')}`;

        // Include unchecked registries info if any
        const fullMessage =
          result.uncheckedRegistries.length > 0
            ? `${message}. ${result.uncheckedRegistries.length} registries could not be checked: ${result.uncheckedRegistries.join(', ')}`
            : message;

        return {
          status: 'success',
          message: fullMessage
        };
      }

      // Issuer not found
      const problems: ProblemDetail[] = [
        {
          type: ProblemTypes.ISSUER_NOT_REGISTERED,
          title: 'Issuer Not Registered',
          detail: `Issuer ${issuerDid} was not found in any known DID registry.`
        }
      ];

      // Add warning about unchecked registries
      if (result.uncheckedRegistries.length > 0) {
        problems.push({
          type: ProblemTypes.REGISTRY_UNCHECKED,
          title: 'Registry Unchecked',
          detail: `${result.uncheckedRegistries.length} registries could not be checked: ${result.uncheckedRegistries.join(', ')}`
        });
      }

      return {
        status: 'failure',
        problems
      };
    } catch (error) {
      // Error during registry lookup
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.REGISTRY_ERROR,
            title: 'Registry Lookup Error',
            detail:
              error instanceof Error
                ? error.message
                : 'An error occurred while looking up issuer in registries.'
          }
        ]
      };
    }
  }
};
