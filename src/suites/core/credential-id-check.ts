import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import { ProblemTypes } from '../../problem-types.js';

/**
 * Check that credential.id, if present, is a valid URL.
 * This is a fatal check - an invalid ID format is a structural problem.
 */
export const credentialIdCheck: VerificationCheck = {
  id: 'core.credential-id',
  name: 'Credential ID Valid',
  description: 'Verifies that the credential ID, if present, is a valid URL.',
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
            type: ProblemTypes.INVALID_CREDENTIAL_ID,
            title: 'Invalid Credential ID',
            detail: 'No verifiable credential found in subject.'
          }
        ]
      };
    }

    const id = credential.id;

    // If id is not present, that's fine (it's optional in the spec)
    if (id === undefined || id === null) {
      return {
        status: 'success',
        message: 'Credential has no ID (optional field).'
      };
    }

    // If id is present, it must be a valid URL
    if (typeof id !== 'string') {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.INVALID_CREDENTIAL_ID,
            title: 'Invalid Credential ID',
            detail: 'Credential ID must be a string URL.'
          }
        ]
      };
    }

    try {
      new URL(id);
    } catch {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.INVALID_CREDENTIAL_ID,
            title: 'Invalid Credential ID',
            detail: `Credential ID is not a valid URL: ${id}`
          }
        ]
      };
    }

    return {
      status: 'success',
      message: 'Credential has a valid ID.'
    };
  }
};
