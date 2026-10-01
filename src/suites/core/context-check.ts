import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';

/**
 * Check that @context exists and is non-empty.
 * This is a fatal check - if there's no context, we can't proceed with verification.
 */
export const contextCheck: VerificationCheck = {
  id: 'core.context-exists',
  name: 'Context Exists',
  description:
    'Verifies that the credential has a non-empty @context property.',
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
            title: 'Invalid JSON-LD',
            detail: 'No verifiable credential found in subject.'
          }
        ]
      };
    }

    const context = credential['@context'];

    if (!context) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: 'Invalid JSON-LD',
            detail: 'Credential is missing required @context property.'
          }
        ]
      };
    }

    // Check if context is a non-empty array or a non-empty string
    const isValidArray = Array.isArray(context) && context.length > 0;
    const isValidString = typeof context === 'string' && context.length > 0;

    if (!isValidArray && !isValidString) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: 'Invalid JSON-LD',
            detail: 'Credential @context property is empty.'
          }
        ]
      };
    }

    return {
      status: 'success',
      message: 'Credential has a valid @context property.'
    };
  }
};
