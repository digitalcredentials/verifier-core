import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { ProblemDetail } from '../../types/problem-detail.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';
import type {
  RegistryCheckPayload,
  RegistryLookupResult
} from '../../types/registry.js';

/**
 * What the lookup found, as the outcome's payload. The message says the
 * same thing in prose; this is the copy meant to be read by code.
 */
function payloadFor(result: RegistryLookupResult): RegistryCheckPayload {
  return {
    matches: result.matches,
    uncheckedRegistries: result.uncheckedRegistries
  };
}

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
 * - No registries provided in VerificationContext (`undefined` or `[]`)
 * - No `lookupIssuers` in VerificationContext
 *
 * Success when:
 * - Issuer found in at least one registry
 *
 * Failure when:
 * - Issuer not found in any registry (`ISSUER_NOT_REGISTERED`). If some
 *   registries could not be checked, its detail says how many answered,
 *   and a `REGISTRY_UNCHECKED` problem follows naming the rest
 * - Every registry could not be checked (`REGISTRY_UNCHECKED` only, since
 *   no registry answered and "not registered" was never established)
 *
 * Whenever the lookup ran — on success and on both of those failures —
 * the outcome carries a {@link RegistryCheckPayload}: the registries that
 * matched, with what each knows about the issuer, and the registries that
 * could not be checked. Read that rather than parsing the `message`.
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

    // An empty list means "skip", as the recognition handler's nested
    // verification relies on.
    if (!context.registries || context.registries.length === 0) {
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

      // Names are for the message only; the payload carries the registries
      // themselves, so a name containing ", " survives.
      const matchingNames = result.matches.map(match => match.registry.name);
      const uncheckedNames = result.uncheckedRegistries.map(
        registry => registry.name
      );

      if (result.found) {
        const message =
          matchingNames.length === 1
            ? `Issuer found in registry: ${matchingNames[0]}`
            : `Issuer found in ${matchingNames.length} registries: ${matchingNames.join(', ')}`;

        // Include unchecked registries info if any
        const fullMessage =
          uncheckedNames.length > 0
            ? `${message}. ${uncheckedNames.length} registries could not be checked: ${uncheckedNames.join(', ')}`
            : message;

        return {
          status: 'success',
          message: fullMessage,
          payload: payloadFor(result)
        };
      }

      const uncheckedSummary = `${uncheckedNames.length} registries could not be checked: ${uncheckedNames.join(', ')}`;

      // Every registry is queried when nothing is found, so equal counts
      // mean no registry answered at all (an injected lookup reporting more
      // is treated the same).
      if (result.uncheckedRegistries.length >= context.registries.length) {
        return {
          status: 'failure',
          problems: [
            {
              type: ProblemTypes.REGISTRY_UNCHECKED,
              title: 'Registry Unchecked',
              detail: `Issuer registration could not be determined: ${uncheckedSummary}`
            }
          ],
          payload: payloadFor(result)
        };
      }

      // Issuer not found. Only the registries that answered establish that;
      // the REGISTRY_UNCHECKED problem below names the rest.
      const uncheckedCount = result.uncheckedRegistries.length;
      const checkedCount = context.registries.length - uncheckedCount;
      const problems: ProblemDetail[] = [
        {
          type: ProblemTypes.ISSUER_NOT_REGISTERED,
          title: 'Issuer Not Registered',
          detail:
            uncheckedCount === 0
              ? `Issuer ${issuerDid} was not found in any known DID registry.`
              : `Issuer ${issuerDid} was not found in the ${checkedCount} ${checkedCount === 1 ? 'registry' : 'registries'} that could be checked; ${uncheckedCount} could not be checked.`
        }
      ];

      // Add warning about unchecked registries
      if (uncheckedCount > 0) {
        problems.push({
          type: ProblemTypes.REGISTRY_UNCHECKED,
          title: 'Registry Unchecked',
          detail: uncheckedSummary
        });
      }

      return {
        status: 'failure',
        problems,
        payload: payloadFor(result)
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
