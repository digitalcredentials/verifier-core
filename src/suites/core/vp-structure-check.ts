import { VerificationCheck, CheckOutcome } from '../../types/check.js';
import { VerificationSubject } from '../../types/subject.js';
import { VerificationContext } from '../../types/context.js';
import type { ProblemDetail } from '../../types/problem-detail.js';
import { ProblemTypes } from '../../problem-types.js';
import {
  asEntries,
  checkFirstContextEntry,
  checkTypedEntry,
  displayPath,
  includesVcContext,
  isPlainObject,
  isUrl,
  stringValues,
  structureProblem,
  VC_CONTEXT_V1,
  VC_CONTEXT_V2,
  type PointerSegments
} from './structure-helpers.js';

const TITLE = 'Invalid Presentation Structure';

/**
 * Check that the presentation meets the structural requirements of
 * the VC Data Model: a VC `@context` as its first entry, a `type` including
 * `VerifiablePresentation`, URL `id` and `holder` when present, typed
 * `proof` entries, and object `verifiableCredential` entries.
 *
 * `proof` is not required, because unsigned presentations are
 * supported. A `@context` with no VC context at all is reported once,
 * at `/@context`; one with a VC context that is not first is reported
 * at `/@context/0` (or `/@context` for a single value). The contents
 * of embedded credentials are not checked
 * here: each one gets its own `verifyCredential` run. Every violation
 * is reported, each as its own problem with a JSON Pointer
 * `instance`.
 *
 * This is a fatal check - a structurally invalid presentation cannot
 * be verified meaningfully.
 */
export const vpStructureCheck: VerificationCheck = {
  id: 'core.vp-structure',
  name: 'VP Structure',
  description:
    'Verifies the presentation meets the structural requirements of the VC Data Model.',
  fatal: true,
  appliesTo: ['verifiablePresentation'],
  execute: async (
    subject: VerificationSubject,
    _context: VerificationContext
  ): Promise<CheckOutcome> => {
    const presentation = subject.verifiablePresentation;

    if (!isPlainObject(presentation)) {
      return {
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.PARSING_ERROR,
            title: TITLE,
            detail: 'No verifiable presentation found in subject.'
          }
        ]
      };
    }

    const problems: ProblemDetail[] = [];
    const report = (pointer: PointerSegments, detail: string): void => {
      problems.push(structureProblem(TITLE, pointer, detail));
    };

    if (!includesVcContext(presentation['@context'])) {
      report(
        ['@context'],
        `"@context" must include "${VC_CONTEXT_V1}" or "${VC_CONTEXT_V2}".`
      );
    }
    checkFirstContextEntry(presentation['@context'], report);

    if (presentation.type === undefined) {
      report(['type'], '"type" is required.');
    } else if (
      !stringValues(presentation.type).includes('VerifiablePresentation')
    ) {
      report(['type'], '"type" must include "VerifiablePresentation".');
    }

    if (presentation.id !== undefined && !isUrl(presentation.id)) {
      report(['id'], '"id" must be a URL.');
    }

    const holder = presentation.holder;
    if (holder !== undefined) {
      if (isPlainObject(holder)) {
        if (!isUrl(holder.id)) {
          report(['holder', 'id'], '"holder.id" must be a URL.');
        }
      } else if (!isUrl(holder)) {
        report(
          ['holder'],
          '"holder" must be a URL or an object with a URL "id".'
        );
      }
    }

    if (presentation.proof !== undefined) {
      for (const [entry, pointer] of asEntries(presentation.proof, ['proof'])) {
        checkTypedEntry(entry, pointer, report);
      }
    }

    if (presentation.verifiableCredential !== undefined) {
      for (const [entry, pointer] of asEntries(
        presentation.verifiableCredential,
        ['verifiableCredential']
      )) {
        if (!isPlainObject(entry)) {
          report(pointer, `"${displayPath(pointer)}" must be an object.`);
        }
      }
    }

    if (problems.length > 0) {
      return { status: 'failure', problems };
    }
    return {
      status: 'success',
      message: 'Presentation structure conforms to the VC Data Model.'
    };
  }
};
