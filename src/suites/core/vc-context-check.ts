import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';

const VC_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1';
const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';

/**
 * Check that @context includes a valid VC context URI.
 * This is a fatal check - we need to know which VC version we're dealing with.
 */
export const vcContextCheck: VerificationCheck = {
  id: 'core.vc-context',
  name: 'VC Context Present',
  description:
    'Verifies that the credential @context includes a valid Verifiable Credentials context URI.',
  fatal: true,
  appliesTo: ['verifiableCredential'],
  execute: async (
    subject: VerificationSubject,
    _context: VerificationContext
  ): Promise<CheckOutcome> => {
    const credential = subject.verifiableCredential as
      | Record<string, unknown>
      | undefined;

    if (!credential) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: 'No VC Context',
            detail: 'No verifiable credential found in subject.'
          }
        ]
      };
    }

    const context = credential['@context'];

    // Normalize context to array of strings
    const contextUris: string[] = [];
    if (typeof context === 'string') {
      contextUris.push(context);
    } else if (Array.isArray(context)) {
      for (const ctx of context) {
        if (typeof ctx === 'string') {
          contextUris.push(ctx);
        }
        // Note: We ignore objects in context (they're JSON-LD context definitions)
      }
    }

    const hasVcContext = contextUris.some(
      uri => uri === VC_CONTEXT_V1 || uri === VC_CONTEXT_V2
    );

    if (!hasVcContext) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: 'No VC Context',
            detail: `Credential @context does not include required VC context URI (${VC_CONTEXT_V1} or ${VC_CONTEXT_V2}).`
          }
        ]
      };
    }

    return {
      status: 'success',
      message: 'Credential @context includes a valid VC context URI.'
    };
  }
};
